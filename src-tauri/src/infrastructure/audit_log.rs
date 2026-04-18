//! Daily JSON-lines audit files under `{app_data}/logs/audit-YYYY-MM-DD.log`.
//! `store_path` in `AppState` is the `connection.json` file; logs live next to it
//! (same as `cron.json`, `skills/`, etc.). Each `AppState::emit_log` line is queued
//! to a background writer for ordered, low-overhead appends.

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use serde_json::json;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

fn logs_dir(store_path: &Path) -> std::path::PathBuf {
    store_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("logs")
}

const AUDIT_PREFIX: &str = "audit-";
const AUDIT_SUFFIX: &str = ".log";

/// Maximum size for reading an audit file into memory (HTTP / Tauri read paths).
pub const MAX_AUDIT_BYTES: u64 = 5 * 1024 * 1024;

const RETENTION_DAYS: i64 = 30;

static AUDIT_APPEND_WARNED: AtomicBool = AtomicBool::new(false);
static AUDIT_PRUNE_WARNED: AtomicBool = AtomicBool::new(false);

fn warn_append_once(msg: &str) {
    if !AUDIT_APPEND_WARNED.swap(true, Ordering::Relaxed) {
        log::warn!("{msg}");
    }
}

fn warn_prune_once(msg: &str) {
    if !AUDIT_PRUNE_WARNED.swap(true, Ordering::Relaxed) {
        log::warn!("{msg}");
    }
}

pub fn parse_audit_date(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn audit_file_path(store_path: &Path, date: &str) -> Option<std::path::PathBuf> {
    parse_audit_date(date)?;
    let name = format!("{AUDIT_PREFIX}{date}{AUDIT_SUFFIX}");
    Some(logs_dir(store_path).join(name))
}

async fn open_audit_append(store_path: &Path, date: &str) -> std::io::Result<tokio::fs::File> {
    let path = audit_file_path(store_path, date).ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            "invalid audit date (expected YYYY-MM-DD)",
        )
    })?;
    let Some(parent) = path.parent() else {
        return Err(std::io::Error::new(
            ErrorKind::InvalidInput,
            "invalid audit path",
        ));
    };
    tokio::fs::create_dir_all(parent).await?;

    let mut std_opts = std::fs::OpenOptions::new();
    std_opts.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        std_opts.mode(0o600);
    }
    tokio::fs::OpenOptions::from(std_opts).open(&path).await
}

async fn prune_old_audit_files(store_path: &Path, max_age_days: i64) -> std::io::Result<()> {
    let dir = logs_dir(store_path);
    let mut rd = match tokio::fs::read_dir(&dir).await {
        Ok(r) => r,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    let cutoff = Local::now().date_naive() - Duration::days(max_age_days);
    loop {
        match rd.next_entry().await {
            Ok(Some(ent)) => {
                let name = ent.file_name().to_string_lossy().to_string();
                if !name.starts_with(AUDIT_PREFIX) || !name.ends_with(AUDIT_SUFFIX) {
                    continue;
                }
                let mid = &name[AUDIT_PREFIX.len()..name.len() - AUDIT_SUFFIX.len()];
                if let Some(d) = parse_audit_date(mid) {
                    if d < cutoff {
                        let _ = tokio::fs::remove_file(ent.path()).await;
                    }
                }
            }
            Ok(None) => break,
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct AuditLine {
    pub kind: String,
    pub message: String,
}

/// Owns audit file handles and performs all appends in order. Run this on Tauri’s async runtime
/// (`tauri::async_runtime::spawn`), not via `tokio::spawn` from `AppState::new` / `setup`, where no
/// Tokio runtime handle is installed yet.
pub async fn run_audit_writer(store_path: PathBuf, mut rx: mpsc::Receiver<AuditLine>) {
    let mut cur: Option<(String, tokio::fs::File)> = None;
    while let Some(AuditLine { kind, message }) = rx.recv().await {
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let need_open = cur.as_ref().map(|(d, _)| d != &date_str).unwrap_or(true);
        if need_open {
            if let Some((old_date, _file)) = cur.take() {
                if old_date != date_str {
                    if let Err(e) = prune_old_audit_files(&store_path, RETENTION_DAYS).await {
                        warn_prune_once(&format!("audit retention: {e}"));
                    }
                }
            }
            match open_audit_append(&store_path, &date_str).await {
                Ok(f) => cur = Some((date_str, f)),
                Err(e) => {
                    warn_append_once(&format!("audit log open: {e}"));
                    continue;
                }
            }
        }

        let line = json!({
            "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "kind": kind,
            "message": message,
        });
        let mut s = line.to_string();
        s.push('\n');

        let Some((_d, file)) = cur.as_mut() else {
            continue;
        };
        if let Err(e) = file.write_all(s.as_bytes()).await {
            warn_append_once(&format!("audit log write: {e}"));
            cur = None;
            continue;
        }
        if let Err(e) = file.flush().await {
            warn_append_once(&format!("audit log flush: {e}"));
            cur = None;
        }
    }
}

/// Map disk / validation errors for Tauri commands (JSON string preserves `ErrorKind` class).
pub fn command_error_from_io(e: std::io::Error) -> String {
    let (code, msg) = match e.kind() {
        ErrorKind::NotFound => ("not_found", "audit log not found".to_string()),
        ErrorKind::InvalidInput => ("bad_request", e.to_string()),
        ErrorKind::InvalidData => ("too_large", e.to_string()),
        _ => ("io_error", e.to_string()),
    };
    serde_json::json!({ "code": code, "message": msg }).to_string()
}

#[derive(Serialize)]
pub struct AuditFileEntry {
    pub date: String,
    pub filename: String,
    pub size_bytes: u64,
}

pub async fn list_audit_files(store_path: &Path) -> std::io::Result<Vec<AuditFileEntry>> {
    let dir = logs_dir(store_path);
    let mut out = Vec::new();
    let mut rd = match tokio::fs::read_dir(&dir).await {
        Ok(r) => r,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e),
    };

    loop {
        match rd.next_entry().await {
            Ok(Some(ent)) => {
                let name = ent.file_name().to_string_lossy().to_string();
                if !name.starts_with(AUDIT_PREFIX) || !name.ends_with(AUDIT_SUFFIX) {
                    continue;
                }
                let mid = &name[AUDIT_PREFIX.len()..name.len() - AUDIT_SUFFIX.len()];
                if parse_audit_date(mid).is_none() {
                    continue;
                }
                let meta = ent.metadata().await?;
                out.push(AuditFileEntry {
                    date: mid.to_string(),
                    filename: name,
                    size_bytes: meta.len(),
                });
            }
            Ok(None) => break,
            Err(e) => return Err(e),
        }
    }

    out.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(out)
}

pub async fn read_audit_file(store_path: &Path, date: &str) -> std::io::Result<String> {
    let path = audit_file_path(store_path, date).ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            "invalid audit date (expected YYYY-MM-DD)",
        )
    })?;
    let meta = tokio::fs::metadata(&path).await?;
    let len = meta.len();
    if len > MAX_AUDIT_BYTES {
        return Err(std::io::Error::new(
            ErrorKind::InvalidData,
            format!("audit log exceeds max size ({MAX_AUDIT_BYTES} bytes; file is {len} bytes)"),
        ));
    }
    tokio::fs::read_to_string(&path).await
}

pub async fn remove_audit_file(store_path: &Path, date: &str) -> std::io::Result<()> {
    let path = audit_file_path(store_path, date).ok_or_else(|| {
        std::io::Error::new(
            ErrorKind::InvalidInput,
            "invalid audit date (expected YYYY-MM-DD)",
        )
    })?;
    tokio::fs::remove_file(&path).await
}

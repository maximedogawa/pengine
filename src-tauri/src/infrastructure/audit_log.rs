//! Daily JSON-lines audit files under `{app_data}/logs/audit-YYYY-MM-DD.log`.
//! `store_path` in `AppState` is the `connection.json` file; logs live next to it
//! (same as `cron.json`, `skills/`, etc.). Each `AppState::emit_log` line is appended.

use chrono::NaiveDate;
use serde::Serialize;
use std::io::ErrorKind;
use std::path::Path;
use tokio::io::AsyncWriteExt;

fn logs_dir(store_path: &Path) -> std::path::PathBuf {
    store_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("logs")
}

const AUDIT_PREFIX: &str = "audit-";
const AUDIT_SUFFIX: &str = ".log";

pub fn parse_audit_date(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

fn audit_file_path(store_path: &Path, date: &str) -> Option<std::path::PathBuf> {
    parse_audit_date(date)?;
    let name = format!("{AUDIT_PREFIX}{date}{AUDIT_SUFFIX}");
    Some(logs_dir(store_path).join(name))
}

pub async fn append_line_for_date(
    store_path: &Path,
    date: &str,
    kind: &str,
    message: &str,
) -> std::io::Result<()> {
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

    let line = serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "kind": kind,
        "message": message,
    });
    let mut s = line.to_string();
    s.push('\n');

    let mut f = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await?;
    f.write_all(s.as_bytes()).await?;
    Ok(())
}

pub async fn append_line_json(store_path: &Path, kind: &str, message: &str) {
    let date_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if let Err(e) = append_line_for_date(store_path, &date_str, kind, message).await {
        log::warn!("audit log: {e}");
    }
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

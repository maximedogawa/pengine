use super::types::CronFile;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static CRON_REPO_MUTEX: Mutex<()> = Mutex::new(());

/// `$APP_DATA/cron.json`, next to `connection.json` / `mcp.json`.
pub fn cron_path(store_path: &Path) -> PathBuf {
    store_path
        .parent()
        .map(|p| p.join("cron.json"))
        .unwrap_or_else(|| PathBuf::from("cron.json"))
}

pub fn load(path: &Path) -> Result<CronFile, String> {
    let _guard = CRON_REPO_MUTEX
        .lock()
        .map_err(|_| "cron repository lock poisoned".to_string())?;
    if !path.exists() {
        return Ok(CronFile::default());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| format!("read cron.json: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(CronFile::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("parse cron.json: {e}"))
}

pub fn save(path: &Path, file: &CronFile) -> Result<(), String> {
    let _guard = CRON_REPO_MUTEX
        .lock()
        .map_err(|_| "cron repository lock poisoned".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create parent dirs for cron.json: {e}"))?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| "cron.json path has no parent directory".to_string())?;
    let pretty =
        serde_json::to_string_pretty(file).map_err(|e| format!("encode cron.json: {e}"))?;

    let mut tmp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("temp file for cron.json: {e}"))?;
    tmp.write_all(pretty.as_bytes())
        .map_err(|e| format!("write temp cron.json: {e}"))?;
    tmp.flush()
        .map_err(|e| format!("flush temp cron.json: {e}"))?;
    tmp.as_file()
        .sync_all()
        .map_err(|e| format!("sync temp cron.json: {e}"))?;
    tmp.persist(path)
        .map_err(|e| format!("replace cron.json: {}", e.error))?;

    if let Some(dir) = path.parent() {
        let d = File::open(dir).map_err(|e| format!("open cron.json parent dir: {e}"))?;
        d.sync_all()
            .map_err(|e| format!("fsync cron.json parent dir: {e}"))?;
    }
    Ok(())
}

//! Persistence for the Telegram connection record.
//!
//! Only metadata (`bot_id`, `bot_username`, `connected_at`) is written to
//! `connection.json`. The bot token lives in the OS keychain — see
//! `modules::secure_store`. `load` is migration-aware: if it finds a legacy file
//! with a `bot_token` field, it moves the token to the keychain and rewrites the
//! file in the new shape before returning the metadata.
use crate::modules::secure_store;
use crate::shared::state::ConnectionMetadata;
use std::path::Path;

pub fn persist(path: &Path, data: &ConnectionMetadata) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read `connection.json` and return metadata. Returns `None` if the file is
/// missing or unparseable. Migration log lines are appended to `migration_log` so
/// callers can emit them through `AppState::emit_log` (the repository itself is
/// sync/filesystem-only and has no access to the bus).
pub fn load(path: &Path, migration_log: &mut Vec<String>) -> Option<ConnectionMetadata> {
    let json = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&json).ok()?;
    let obj = value.as_object()?;

    let bot_id = obj.get("bot_id")?.as_str()?.to_string();
    let bot_username = obj.get("bot_username")?.as_str()?.to_string();
    let connected_at = obj
        .get("connected_at")?
        .as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())?
        .with_timezone(&chrono::Utc);

    if let Some(token) = obj
        .get("bot_token")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        let meta = ConnectionMetadata {
            bot_id: bot_id.clone(),
            bot_username: bot_username.clone(),
            connected_at,
        };
        match secure_store::save_token(&bot_id, token) {
            Ok(()) => {
                if let Err(e) = persist(path, &meta) {
                    migration_log.push(format!(
                        "WARN: moved bot token to keychain but failed to strip plaintext \
                         from {}: {e}. Delete the file manually or the next startup will \
                         re-migrate (harmless).",
                        path.display()
                    ));
                } else {
                    migration_log.push(
                        "Migrated plaintext bot token from connection.json to OS keychain."
                            .to_string(),
                    );
                }
            }
            Err(e) => {
                migration_log.push(format!(
                    "ERROR: could not migrate plaintext bot token to keychain: {e}. \
                     Leaving connection.json untouched; the bot will fall back to re-prompting."
                ));
                return None;
            }
        }
    }

    Some(ConnectionMetadata {
        bot_id,
        bot_username,
        connected_at,
    })
}

pub fn clear(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

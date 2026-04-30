//! CLI/REPL session — minimal turn history + persistence for `/compact`,
//! `/resume`, `/cost`, and `--continue`.
//!
//! Pengine's `agent::run_turn` is single-shot. To give the REPL a
//! Claude-Code-like continuity we keep a session here and prepend prior
//! context to each new user message before handing it to the agent.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const SESSIONS_DIRNAME: &str = "cli_sessions";
const LAST_POINTER: &str = "cli_session_last.json";
const BY_PATH_POINTER: &str = "cli_session_by_path.json";

/// Cap applied when building the context prefix for a new turn.
/// Keeps the prompt size predictable across long sessions.
const HISTORY_TURN_BUDGET: usize = 6;
const HISTORY_BYTES_BUDGET: usize = 12_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTurn {
    pub at: DateTime<Utc>,
    pub user: String,
    pub assistant: String,
    pub prompt_tokens: u64,
    pub eval_tokens: u64,
    pub model: String,
}

/// Project context captured when a session first turns or the REPL starts.
/// Used for the REPL banner and for matching `--continue` to the right session
/// when the user invokes pengine from a different folder than last time.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectContext {
    /// Working directory pengine was started in (absolute when possible).
    pub cwd: PathBuf,
    /// Git toplevel containing `cwd`, if any. Used as the per-folder match key
    /// so `pengine` from `repo/` and `repo/src/` resume the same session.
    pub git_root: Option<PathBuf>,
    /// Branch name (`refs/heads/<…>`) or 7-char SHA prefix when detached.
    pub git_branch: Option<String>,
}

impl ProjectContext {
    /// Stable per-folder key for the by-path pointer index. Prefers the git
    /// toplevel so subdirectory invocations resolve to the same session.
    pub fn match_key(&self) -> &Path {
        self.git_root.as_deref().unwrap_or(self.cwd.as_path())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliSession {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub turns: Vec<SessionTurn>,
    /// Set by `/compact`. When present, replaces the older turns when
    /// building the context prefix.
    pub summary: Option<String>,
    pub prompt_tokens_total: u64,
    pub eval_tokens_total: u64,
    /// Where pengine was started. `None` for legacy sessions saved before
    /// the project field was introduced.
    #[serde(default)]
    pub project: Option<ProjectContext>,
}

impl CliSession {
    pub fn fresh() -> Self {
        let now = Utc::now();
        Self {
            id: now.format("%Y%m%dT%H%M%S").to_string(),
            started_at: now,
            turns: Vec::new(),
            summary: None,
            prompt_tokens_total: 0,
            eval_tokens_total: 0,
            project: None,
        }
    }

    pub fn fresh_with_project(project: ProjectContext) -> Self {
        let mut s = Self::fresh();
        s.project = Some(project);
        s
    }

    pub fn record_turn(
        &mut self,
        user: &str,
        assistant: &str,
        prompt_tokens: u64,
        eval_tokens: u64,
        model: &str,
    ) {
        self.turns.push(SessionTurn {
            at: Utc::now(),
            user: user.to_string(),
            assistant: assistant.to_string(),
            prompt_tokens,
            eval_tokens,
            model: model.to_string(),
        });
        self.prompt_tokens_total = self.prompt_tokens_total.saturating_add(prompt_tokens);
        self.eval_tokens_total = self.eval_tokens_total.saturating_add(eval_tokens);
    }

    /// Build the prior-context prefix that gets prepended to a fresh user
    /// message. Empty when the session is empty.
    pub fn context_prefix(&self) -> String {
        let mut out = String::new();
        if let Some(s) = self.summary.as_deref() {
            if !s.trim().is_empty() {
                out.push_str("## Prior session summary\n");
                out.push_str(s.trim());
                out.push_str("\n\n");
            }
        }
        let take_from = self.turns.len().saturating_sub(HISTORY_TURN_BUDGET);
        let mut bytes_used = 0usize;
        let mut pieces: Vec<String> = Vec::new();
        for t in &self.turns[take_from..] {
            let piece = format!(
                "[user] {}\n[assistant] {}\n",
                t.user.trim(),
                t.assistant.trim()
            );
            bytes_used = bytes_used.saturating_add(piece.len());
            if bytes_used > HISTORY_BYTES_BUDGET && !pieces.is_empty() {
                break;
            }
            pieces.push(piece);
        }
        if !pieces.is_empty() {
            out.push_str("## Prior turns (most recent last)\n");
            for p in &pieces {
                out.push_str(p);
            }
            out.push('\n');
        }
        out
    }
}

fn sessions_dir(store_path: &Path) -> PathBuf {
    store_path
        .parent()
        .map(|p| p.join(SESSIONS_DIRNAME))
        .unwrap_or_else(|| PathBuf::from(SESSIONS_DIRNAME))
}

fn last_pointer(store_path: &Path) -> PathBuf {
    store_path
        .parent()
        .map(|p| p.join(LAST_POINTER))
        .unwrap_or_else(|| PathBuf::from(LAST_POINTER))
}

fn by_path_pointer(store_path: &Path) -> PathBuf {
    store_path
        .parent()
        .map(|p| p.join(BY_PATH_POINTER))
        .unwrap_or_else(|| PathBuf::from(BY_PATH_POINTER))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LastPointer {
    last_session_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ByPathPointer {
    /// Map of project match key (canonicalized when possible) → most recent session id.
    #[serde(default)]
    paths: HashMap<String, String>,
}

fn read_by_path(store_path: &Path) -> ByPathPointer {
    let path = by_path_pointer(store_path);
    let Ok(body) = fs::read_to_string(&path) else {
        return ByPathPointer::default();
    };
    serde_json::from_str(&body).unwrap_or_default()
}

fn write_by_path(store_path: &Path, p: &ByPathPointer) -> Result<(), String> {
    let body = serde_json::to_string_pretty(p).map_err(|e| format!("encode by_path: {e}"))?;
    fs::write(by_path_pointer(store_path), body).map_err(|e| format!("write by_path: {e}"))
}

/// Stable string form of a project match key. Canonicalize when possible so
/// `repo/` and `./repo/` collapse to the same entry, but keep the raw path as
/// fallback if canonicalization fails (e.g. directory was deleted since).
fn project_key_string(key: &Path) -> String {
    fs::canonicalize(key)
        .unwrap_or_else(|_| key.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

pub fn save(store_path: &Path, session: &CliSession) -> Result<(), String> {
    let dir = sessions_dir(store_path);
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let path = dir.join(format!("{}.json", session.id));
    let body = serde_json::to_string_pretty(session).map_err(|e| format!("encode: {e}"))?;
    fs::write(&path, body).map_err(|e| format!("write {}: {e}", path.display()))?;
    let pointer = LastPointer {
        last_session_id: session.id.clone(),
    };
    let pointer_body =
        serde_json::to_string_pretty(&pointer).map_err(|e| format!("encode pointer: {e}"))?;
    fs::write(last_pointer(store_path), pointer_body).map_err(|e| format!("write pointer: {e}"))?;

    // Per-folder pointer so `--continue` from the same project resumes its
    // own session even when other projects' sessions are more recent.
    if let Some(project) = session.project.as_ref() {
        let mut by_path = read_by_path(store_path);
        by_path
            .paths
            .insert(project_key_string(project.match_key()), session.id.clone());
        if let Err(e) = write_by_path(store_path, &by_path) {
            log::warn!("session: by_path pointer write failed: {e}");
        }
    }
    Ok(())
}

pub fn load_last(store_path: &Path) -> Result<Option<CliSession>, String> {
    let pointer_path = last_pointer(store_path);
    let body = match fs::read_to_string(&pointer_path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read pointer: {e}")),
    };
    let p: LastPointer = serde_json::from_str(&body).map_err(|e| format!("parse pointer: {e}"))?;
    load_by_id(store_path, &p.last_session_id)
}

/// Resume the most recent session whose project matches `key` (typically the
/// current cwd or its git toplevel). Returns `Ok(None)` when there is no
/// matching session — callers fall back to [`load_last`] for cross-folder
/// continuity.
pub fn load_last_for_path(store_path: &Path, key: &Path) -> Result<Option<CliSession>, String> {
    let by_path = read_by_path(store_path);
    let Some(id) = by_path.paths.get(&project_key_string(key)) else {
        return Ok(None);
    };
    load_by_id(store_path, id)
}

fn load_by_id(store_path: &Path, id: &str) -> Result<Option<CliSession>, String> {
    let dir = sessions_dir(store_path);
    let path = dir.join(format!("{id}.json"));
    let body = match fs::read_to_string(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let s: CliSession = serde_json::from_str(&body).map_err(|e| format!("parse session: {e}"))?;
    Ok(Some(s))
}

/// Detect the project context for `cwd`: walks up looking for a `.git`
/// directory (or `.git` file for worktrees) and parses the branch from
/// `HEAD`. Falls back to a 7-char SHA prefix on detached HEAD; returns
/// `git_root: None` when `cwd` is outside any repo.
pub fn detect_project_context(cwd: &Path) -> ProjectContext {
    let cwd_owned = fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
    let (git_root, git_branch) = detect_git(&cwd_owned);
    ProjectContext {
        cwd: cwd_owned,
        git_root,
        git_branch,
    }
}

fn detect_git(start: &Path) -> (Option<PathBuf>, Option<String>) {
    let mut here = start.to_path_buf();
    loop {
        let dot_git = here.join(".git");
        if let Ok(meta) = fs::metadata(&dot_git) {
            let head_path = if meta.is_dir() {
                Some(dot_git.join("HEAD"))
            } else if meta.is_file() {
                // Worktree: `.git` is a file `gitdir: <abs>` pointing to
                // the real git dir under `<repo>/.git/worktrees/<name>`.
                fs::read_to_string(&dot_git).ok().and_then(|s| {
                    s.trim()
                        .strip_prefix("gitdir: ")
                        .map(|p| PathBuf::from(p).join("HEAD"))
                })
            } else {
                None
            };
            let branch = head_path.and_then(parse_head_ref);
            return (Some(here), branch);
        }
        if !here.pop() {
            return (None, None);
        }
    }
}

fn parse_head_ref(head_path: PathBuf) -> Option<String> {
    let raw = fs::read_to_string(&head_path).ok()?;
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("ref: refs/heads/") {
        return Some(rest.to_string());
    }
    // Detached HEAD: keep the short SHA so the banner stays informative.
    if trimmed.len() >= 7 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(trimmed.chars().take(7).collect());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip_save_and_load_last() {
        let dir = tempdir().unwrap();
        let store = dir.path().join("connection.json");
        fs::write(&store, "{}").unwrap();
        let mut s = CliSession::fresh();
        s.record_turn("hi", "hello", 10, 5, "qwen3:0.5b");
        save(&store, &s).unwrap();
        let loaded = load_last(&store).unwrap().unwrap();
        assert_eq!(loaded.id, s.id);
        assert_eq!(loaded.turns.len(), 1);
        assert_eq!(loaded.prompt_tokens_total, 10);
        assert_eq!(loaded.eval_tokens_total, 5);
    }

    #[test]
    fn context_prefix_includes_summary_and_turns() {
        let mut s = CliSession::fresh();
        s.summary = Some("we discussed cats".into());
        s.record_turn("hello", "hi there", 5, 3, "m");
        let prefix = s.context_prefix();
        assert!(prefix.contains("we discussed cats"));
        assert!(prefix.contains("[user] hello"));
        assert!(prefix.contains("[assistant] hi there"));
    }

    #[test]
    fn context_prefix_empty_for_fresh_session() {
        let s = CliSession::fresh();
        assert!(s.context_prefix().is_empty());
    }

    #[test]
    fn save_records_per_path_pointer_and_load_for_path_returns_it() {
        let dir = tempdir().unwrap();
        let store = dir.path().join("connection.json");
        fs::write(&store, "{}").unwrap();
        let project_root = dir.path().join("repo-a");
        fs::create_dir_all(&project_root).unwrap();

        let project = ProjectContext {
            cwd: project_root.clone(),
            git_root: Some(project_root.clone()),
            git_branch: Some("feature-x".into()),
        };
        let mut s = CliSession::fresh_with_project(project.clone());
        s.record_turn("ping", "pong", 1, 1, "m");
        save(&store, &s).unwrap();

        let loaded = load_last_for_path(&store, project.match_key())
            .unwrap()
            .expect("session for project");
        assert_eq!(loaded.id, s.id);
        assert_eq!(
            loaded.project.as_ref().unwrap().git_branch.as_deref(),
            Some("feature-x")
        );
    }

    #[test]
    fn load_for_path_returns_none_for_unknown_folder() {
        let dir = tempdir().unwrap();
        let store = dir.path().join("connection.json");
        fs::write(&store, "{}").unwrap();
        let other = dir.path().join("other");
        fs::create_dir_all(&other).unwrap();
        assert!(load_last_for_path(&store, &other).unwrap().is_none());
    }

    #[test]
    fn detect_project_context_reads_branch_from_head() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("repo");
        let dot_git = repo.join(".git");
        fs::create_dir_all(&dot_git).unwrap();
        fs::write(dot_git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        let sub = repo.join("src");
        fs::create_dir_all(&sub).unwrap();

        let ctx = detect_project_context(&sub);
        assert_eq!(ctx.git_branch.as_deref(), Some("main"));
        assert_eq!(
            fs::canonicalize(ctx.git_root.unwrap()).unwrap(),
            fs::canonicalize(&repo).unwrap()
        );
    }

    #[test]
    fn detect_project_context_returns_short_sha_for_detached_head() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("repo");
        let dot_git = repo.join(".git");
        fs::create_dir_all(&dot_git).unwrap();
        fs::write(dot_git.join("HEAD"), "deadbeefcafebabe1234567890abcdef\n").unwrap();
        let ctx = detect_project_context(&repo);
        assert_eq!(ctx.git_branch.as_deref(), Some("deadbee"));
    }

    #[test]
    fn detect_project_context_outside_repo_returns_none_root() {
        let dir = tempdir().unwrap();
        let outside = dir.path().join("loose");
        fs::create_dir_all(&outside).unwrap();
        let ctx = detect_project_context(&outside);
        assert!(ctx.git_root.is_none());
        assert!(ctx.git_branch.is_none());
    }
}

use crate::modules::ollama::constants::{OLLAMA_CHAT_URL, OLLAMA_PS_URL, OLLAMA_TAGS_URL};
use std::sync::OnceLock;

static HTTP: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP.get_or_init(reqwest::Client::new)
}

#[derive(Debug, Clone)]
pub struct ModelCatalog {
    pub active: Option<String>,
    pub models: Vec<String>,
}

/// Returns active model and the full pulled model list (`/api/tags`).
pub async fn model_catalog(timeout_ms: u64) -> Result<ModelCatalog, String> {
    let client = http_client();
    let timeout = std::time::Duration::from_millis(timeout_ms);

    let mut active: Option<String> = None;
    if let Ok(resp) = client.get(OLLAMA_PS_URL).timeout(timeout).send().await {
        if let Ok(body) = resp.json::<serde_json::Value>().await {
            active = body["models"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|m| m["name"].as_str())
                .map(|s| s.to_string());
        }
    }

    let resp = client
        .get(OLLAMA_TAGS_URL)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| format!("ollama unreachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ollama tags HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<String> = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if let Some(ref a) = active {
        if !models.iter().any(|m| m == a) {
            models.insert(0, a.clone());
        }
    }

    Ok(ModelCatalog { active, models })
}

/// Returns the currently loaded model (from `/api/ps`), falling back to the
/// first pulled model (from `/api/tags`) if nothing is loaded yet.
pub async fn active_model() -> Result<String, String> {
    let catalog = model_catalog(5000).await?;
    if let Some(active) = catalog.active {
        return Ok(active);
    }
    catalog
        .models
        .first()
        .cloned()
        .ok_or_else(|| "no models pulled in ollama".to_string())
}

/// Outcome of a single chat call so the caller knows whether tools were used.
pub struct ChatResult {
    pub message: serde_json::Value,
    /// `true` when the model actually received tools; `false` when we had to
    /// fall back to a plain chat because the model doesn't support them.
    pub tools_supported: bool,
}

/// Tool-aware chat for the agent loop. Sends a full message history plus a
/// list of tool definitions and returns the raw assistant message (which may
/// contain `tool_calls`). Caller is responsible for executing tools and
/// looping.
///
/// If the model rejects tools (HTTP 400 "does not support tools"), the request
/// is transparently retried without tools so older models still work.
pub async fn chat_with_tools(
    model: &str,
    messages: &serde_json::Value,
    tools: &serde_json::Value,
) -> Result<ChatResult, String> {
    let has_tools = tools.as_array().is_some_and(|a| !a.is_empty());

    let mut payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
    });
    if has_tools {
        payload["tools"] = tools.clone();
    }

    let (status, body) = post_chat(&payload).await?;

    if !status.is_success() {
        let err_text = body["error"].as_str().unwrap_or("");
        if has_tools && err_text.contains("does not support tools") {
            let plain = serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": false,
            });
            let (st, b) = post_chat(&plain).await?;
            if !st.is_success() {
                return Err(format!("ollama chat HTTP {st}: {b}"));
            }
            return Ok(ChatResult {
                message: extract_message(&b),
                tools_supported: false,
            });
        }
        return Err(format!("ollama chat HTTP {status}: {body}"));
    }

    Ok(ChatResult {
        message: extract_message(&body),
        tools_supported: has_tools,
    })
}

async fn post_chat(
    payload: &serde_json::Value,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let resp = http_client()
        .post(OLLAMA_CHAT_URL)
        .json(payload)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok((status, body))
}

fn extract_message(body: &serde_json::Value) -> serde_json::Value {
    body.get("message")
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

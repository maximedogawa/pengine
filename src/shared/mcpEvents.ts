/** Dispatched when MCP registry (e.g. mcp.json) may have changed from outside the MCP panel. */
export const PENGINE_MCP_REGISTRY_CHANGED = "pengine:mcp-registry-changed";

export function notifyMcpRegistryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PENGINE_MCP_REGISTRY_CHANGED));
}

/** Tauri event name — must match `REGISTRY_CHANGED_EVENT` in `mcp/service.rs`. */
const TAURI_REGISTRY_CHANGED = "pengine-registry-changed";

/**
 * Bridge backend Tauri event into the browser window event that panels already listen for.
 * Call once at app startup.
 */
export function initTauriRegistryBridge(): void {
  import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen(TAURI_REGISTRY_CHANGED, () => {
        notifyMcpRegistryChanged();
      }),
    )
    .catch(() => {
      // Not running inside Tauri shell — no bridge needed.
    });
}

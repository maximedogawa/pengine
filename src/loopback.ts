import { OLLAMA_API_BASE, PENGINE_API_BASE } from "./config";

/** Loopback HTTP API paths (Tauri `connection_server`). */
export const PENGINE = {
  connect: `${PENGINE_API_BASE}/v1/connect`,
  health: `${PENGINE_API_BASE}/v1/health`,
  logs: `${PENGINE_API_BASE}/v1/logs`,
} as const;

export type OllamaProbe = { reachable: boolean; model: string | null };

/** Prefer loaded model from `/api/ps`, else first pulled model from `/api/tags`. */
export async function fetchOllamaModel(timeoutMs = 3000): Promise<OllamaProbe> {
  try {
    const psResp = await fetch(`${OLLAMA_API_BASE}/api/ps`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (psResp.ok) {
      const psData = await psResp.json();
      const loaded = psData.models?.[0]?.name as string | undefined;
      if (loaded) return { reachable: true, model: loaded };
    }
    const tagsResp = await fetch(`${OLLAMA_API_BASE}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (tagsResp.ok) {
      const tagsData = await tagsResp.json();
      const first = tagsData.models?.[0]?.name as string | undefined ?? null;
      return { reachable: true, model: first ?? null };
    }
    return { reachable: false, model: null };
  } catch {
    return { reachable: false, model: null };
  }
}

export type PengineHealth = {
  status: string;
  bot_connected: boolean;
  bot_username?: string;
  bot_id?: string | null;
};

/** GET `/v1/health`; JSON on 200, otherwise `null` (offline / error). */
export async function getPengineHealth(timeoutMs: number): Promise<PengineHealth | null> {
  try {
    const resp = await fetch(PENGINE.health, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return null;
    return (await resp.json()) as PengineHealth;
  } catch {
    return null;
  }
}

export async function postConnect(botToken: string) {
  const resp = await fetch(PENGINE.connect, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_token: botToken.trim() }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await resp.json()) as { bot_id?: string; bot_username?: string; error?: string };
  return { ok: resp.ok, data };
}

export async function deleteConnect() {
  const resp = await fetch(PENGINE.connect, {
    method: "DELETE",
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(detail || `Disconnect failed (HTTP ${resp.status})`);
  }
}

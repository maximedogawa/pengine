import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPengineHealth } from "../modules/bot/api";
import { TerminalPreview } from "../modules/bot/components/TerminalPreview";
import { useAppSessionStore } from "../modules/bot/store/appSessionStore";
import { McpToolsPanel } from "../modules/mcp/components/McpToolsPanel";
import { fetchOllamaModel } from "../modules/ollama/api";
import { TopMenu } from "../shared/ui/TopMenu";

type ServiceInfo = {
  name: string;
  status: "running" | "stopped" | "checking";
  detail: string;
};

export function DashboardPage() {
  const navigate = useNavigate();
  const isDeviceConnected = useAppSessionStore((state) => state.isDeviceConnected);
  const disconnectDevice = useAppSessionStore((state) => state.disconnectDevice);
  const botUsername = useAppSessionStore((state) => state.botUsername);
  const [services, setServices] = useState<ServiceInfo[]>([
    { name: "Telegram gateway", status: "checking", detail: "Checking…" },
    { name: "Pengine runtime", status: "checking", detail: "Checking…" },
    { name: "Ollama", status: "checking", detail: "Checking…" },
  ]);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    let botUser = botUsername ?? "unknown";
    const health = await getPengineHealth(3000);
    const pengineUp = !!health;
    const botConnected = health?.bot_connected ?? false;
    if (health?.bot_username) botUser = health.bot_username;

    const { reachable: ollamaUp, model: ollamaModel } = await fetchOllamaModel(2000);

    setServices([
      {
        name: "Pengine",
        status: pengineUp ? "running" : "stopped",
        detail: pengineUp ? "API reachable" : "Not running",
      },
      {
        name: "Telegram",
        status: botConnected ? "running" : "stopped",
        detail: botConnected ? `@${botUser}` : "Not connected",
      },
      {
        name: "Ollama",
        status: ollamaUp ? "running" : "stopped",
        detail: ollamaUp ? (ollamaModel ? ollamaModel : "No model loaded") : "Not reachable",
      },
    ]);
  }, [botUsername]);

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 10000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const handleDisconnect = async () => {
    setDisconnectError(null);
    try {
      await disconnectDevice();
      navigate("/setup", { replace: true });
    } catch (e) {
      setDisconnectError(e instanceof Error ? e.message : "Could not disconnect");
    }
  };

  const allRunning = services.every((s) => s.status === "running");

  return (
    <div className="relative overflow-x-clip pb-20">
      <TopMenu />

      <main className="section-shell pt-6 sm:pt-10">
        {/* ── Status bar: services + connection ──────────────────── */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Overall status */}
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${
                allRunning ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-rose-400"
              }`}
            />
            <p className="font-mono text-xs font-semibold text-white sm:text-sm">
              {allRunning ? "All systems running" : "Some services offline"}
            </p>
          </div>

          <div className="mx-0.5 hidden h-4 w-px bg-white/10 sm:block" />

          {/* Service pills — hide detail text on small screens */}
          {services.map((service) => (
            <div
              key={service.name}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 sm:px-3"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  service.status === "running"
                    ? "bg-emerald-400"
                    : service.status === "stopped"
                      ? "bg-rose-400"
                      : "bg-yellow-400"
                }`}
              />
              <span className="font-mono text-[10px] text-white/70 sm:text-[11px]">
                {service.name}
              </span>
              <span className="hidden font-mono text-[11px] text-white/40 sm:inline">
                {service.detail}
              </span>
            </div>
          ))}

          {/* Connection controls */}
          <div className="ml-auto flex items-center gap-2">
            {!isDeviceConnected && (
              <Link
                to="/setup"
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Setup
              </Link>
            )}
            {isDeviceConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="rounded-lg border border-rose-300/20 bg-transparent px-3 py-1 font-mono text-[11px] text-rose-300/60 transition hover:bg-rose-300/10 hover:text-rose-200"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {disconnectError && (
          <p className="mt-2 font-mono text-xs text-rose-300">{disconnectError}</p>
        )}

        {/* ── Terminal (full width) ────────────────────────────── */}
        <section className="mt-4 sm:mt-6">
          <TerminalPreview />
        </section>

        {/* ── Servers & tools ─────────────────────────────────────── */}
        <section className="mt-4 sm:mt-6">
          <McpToolsPanel />
        </section>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { PENGINE_API_BASE } from "./config";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { SetupPage } from "./pages/SetupPage";
import { useAppSessionStore } from "./stores/appSessionStore";

function AutoForward() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDeviceConnected = useAppSessionStore((state) => state.isDeviceConnected);
  const connectDevice = useAppSessionStore((state) => state.connectDevice);

  useEffect(() => {
    if (isDeviceConnected) return;
    if (location.pathname === "/dashboard" || location.pathname === "/setup") return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${PENGINE_API_BASE}/v1/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (data.bot_connected && data.bot_username && !cancelled) {
          connectDevice({ bot_username: data.bot_username, bot_id: "" });
          navigate("/dashboard", { replace: true });
        }
      } catch {
        // local app not running — stay where we are
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDeviceConnected, connectDevice, navigate, location.pathname]);

  return null;
}

function App() {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (useAppSessionStore.persist.hasHydrated()) {
      setSessionReady(true);
      return;
    }
    return useAppSessionStore.persist.onFinishHydration(() => {
      setSessionReady(true);
    });
  }, []);

  if (!sessionReady) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400"
        data-testid="session-hydrating"
      >
        <p className="font-mono text-xs uppercase tracking-[0.2em]">Loading…</p>
      </div>
    );
  }

  return (
    <div data-testid="app-ready">
      <AutoForward />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;

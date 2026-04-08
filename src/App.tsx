import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { SetupPage } from "./pages/SetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { useAppSessionStore } from "./stores/appSessionStore";

function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const isDeviceConnected = useAppSessionStore((state) => state.isDeviceConnected);

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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route
          path="/dashboard"
          element={isDeviceConnected ? <DashboardPage /> : <Navigate to="/setup" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;

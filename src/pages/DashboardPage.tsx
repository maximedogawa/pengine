import { useNavigate } from "react-router-dom";
import { TopMenu } from "../components/TopMenu";
import { useAppSessionStore } from "../stores/appSessionStore";

const services = [
  { name: "Telegram gateway", status: "running", detail: "Long poll connected" },
  { name: "Pengine runtime", status: "running", detail: "Worker loop active" },
  { name: "Ollama", status: "running", detail: "localhost:11434 reachable" },
  { name: "Docker tools", status: "running", detail: "Container bridge online" },
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const disconnectDevice = useAppSessionStore((state) => state.disconnectDevice);

  const handleDisconnect = () => {
    disconnectDevice();
    navigate("/setup", { replace: true });
  };

  return (
    <div className="relative overflow-x-hidden pb-20">
      <TopMenu ctaLabel="Project overview" ctaTo="/" showNavigationLinks={false} />

      <main className="section-shell pt-10">
        <section className="max-w-4xl">
          <p className="mono-label">Dashboard</p>
          <h1 className="mt-3 text-5xl font-extrabold leading-tight tracking-tight text-white">
            Connected device and running services
          </h1>
          <p className="mt-5 max-w-3xl subtle-copy">
            This is the minimal monitor view for an active device session. If all
            services are online, the agent is reachable through Telegram and ready
            to process messages.
          </p>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="panel p-5">
            <p className="mono-label">Services</p>
            <div className="mt-4 grid gap-3">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{service.name}</p>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-(--mid)">
                      {service.detail}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-200">
                    {service.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="panel rounded-4xl p-6">
              <p className="mono-label">Device session</p>
              <p className="mt-3 text-lg font-semibold text-white">1 connected device</p>
              <p className="mt-2 subtle-copy">
                Telegram messaging is active and local runtime services are
                available.
              </p>
            </div>

            <div className="panel p-6">
              <p className="mono-label">Controls</p>
              <p className="mt-3 subtle-copy">
                Disconnect the current device session and return to setup.
              </p>
              <button
                type="button"
                className="secondary-button mt-5 w-full rounded-xl border-rose-300/30 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15"
                onClick={handleDisconnect}
              >
                Disconnect device
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { WizardLayout } from "./WizardLayout";
import { StyledQrCode } from "./StyledQrCode";

export const SETUP_STEPS = [
  {
    title: "Create bot",
    summary: "Create a Telegram bot with BotFather and save your bot token.",
    duration: "~1 min",
  },
  {
    title: "Install Ollama",
    summary: "Install Ollama on this machine so Pengine can run models locally.",
    duration: "~2 min",
  },
  {
    title: "Pengine local",
    summary: "Install and start the Pengine runtime on this computer.",
    duration: "~2 min",
  },
  {
    title: "Connect",
    summary: "Pengine links to your bot automatically using the bot ID from your token.",
    duration: "~30 sec",
  },
] as const;

function parseBotIdFromToken(token: string): string | null {
  const trimmed = token.trim();
  const match = /^(\d{8,12}):/.exec(trimmed);
  return match ? match[1] : null;
}

function tokenStatus(token: string) {
  if (!token.trim()) return "idle";
  if (/^\d{8,12}:[A-Za-z0-9_-]{35,}$/.test(token.trim())) return "valid";
  return "typing";
}

function tokenStatusMessage(status: ReturnType<typeof tokenStatus>) {
  if (status === "valid") return "Token format looks valid. Continue when ready.";
  if (status === "typing") return "Token looks incomplete, keep going.";
  return "Waiting for your token.";
}

type SetupWizardProps = {
  onStepChange?: (step: number) => void;
  onCompleteSetup?: () => void;
};

export function SetupWizard({ onStepChange, onCompleteSetup }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [botToken, setBotToken] = useState("");
  const [mockOllamaReady, setMockOllamaReady] = useState(false);
  const [mockPengineLocalReady, setMockPengineLocalReady] = useState(false);
  const [mockBotLinked, setMockBotLinked] = useState(false);
  const [botUsername, setBotUsername] = useState("");

  const status = useMemo(() => tokenStatus(botToken), [botToken]);
  const stepTitles = SETUP_STEPS.map((item) => item.title);
  const botId = useMemo(() => parseBotIdFromToken(botToken), [botToken]);
  const telegramBotUrl = useMemo(() => {
    const u = botUsername.replace(/^@+/, "").trim();
    if (u) return `https://t.me/${u}`;
    return "https://t.me/botfather";
  }, [botUsername]);

  const canContinueStep = useMemo(() => {
    if (step === 0) return status === "valid";
    if (step === 1) return mockOllamaReady;
    if (step === 2) return mockPengineLocalReady;
    if (step === 3) return mockBotLinked;
    return false;
  }, [step, status, mockOllamaReady, mockPengineLocalReady, mockBotLinked]);

  const canGoNext = step < stepTitles.length - 1 && canContinueStep;

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  return (
    <WizardLayout
      stepTitles={stepTitles}
      activeStep={step}
      onBack={() => setStep((prev) => Math.max(0, prev - 1))}
      onNext={() => setStep((prev) => Math.min(stepTitles.length - 1, prev + 1))}
      onSelectStep={(index) => setStep(index)}
      canGoBack={step > 0}
      canGoNext={canGoNext}
    >
      {step === 0 && (
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div>
              <p className="mono-label">Step 1</p>
              <h2 className="mt-2 text-3xl font-extrabold text-white">
                Create your Telegram bot
              </h2>
              <p className="mt-3 subtle-copy">
                Open BotFather, create a new bot, then paste the token here. You
                will need it for the final connect step.
              </p>
            </div>
            <a
              className="primary-button w-fit rounded-xl px-5 py-3 text-xs"
              href="https://t.me/botfather"
              target="_blank"
              rel="noreferrer"
            >
              Open BotFather
            </a>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <label htmlFor="token" className="font-mono text-xs uppercase tracking-[0.14em] text-(--mid)">
                Bot token
              </label>
              <input
                id="token"
                className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none placeholder:text-(--dim) focus:border-cyan-300/40"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ-abc123..."
              />
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    status === "valid"
                      ? "status-pulse bg-emerald-300"
                      : status === "typing"
                        ? "bg-yellow-300"
                        : "bg-slate-500"
                  }`}
                />
                <p className="text-(--mid)">{tokenStatusMessage(status)}</p>
              </div>
            </div>
          </div>
          <div className="panel rounded-4xl p-5">
            <p className="mono-label">Why</p>
            <p className="mt-4 text-sm text-slate-200">
              The token encodes your <strong className="text-slate-100">bot ID</strong>.
              Later, Pengine uses that ID to pair with your bot automatically. No
              extra linking form in production.
            </p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mono-label">Step 2</p>
            <h2 className="mt-2 text-3xl font-extrabold text-white">Install Ollama</h2>
            <p className="mt-3 subtle-copy">
              Ollama runs models on this machine. Install it, then use the demo
              button to continue (real health checks can replace this later).
            </p>
            <pre className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-sm text-emerald-200">
              <code>{`curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2`}</code>
            </pre>
            <button
              type="button"
              className="secondary-button mt-4 w-full max-w-md rounded-xl text-xs"
              onClick={() => setMockOllamaReady(true)}
            >
              Mark Ollama ready (demo)
            </button>
            {mockOllamaReady && (
              <p className="mt-3 font-mono text-xs text-emerald-300">
                Mock: Ollama OK at localhost:11434
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-emerald-200">
              Checklist
            </p>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-100">
              <li>Installer finished without errors</li>
              <li>At least one model pulled (e.g. llama3.2)</li>
              <li>Then use the demo button to continue</li>
            </ul>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mono-label">Step 3</p>
            <h2 className="mt-2 text-3xl font-extrabold text-white">Install Pengine locally</h2>
            <p className="mt-3 subtle-copy">
              Run the Pengine agent on this computer (browser tab or Tauri app).
              For now this is a mock step: confirm the local runtime is “started”.
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 font-mono text-xs text-(--mid)">
              <p>Future: download / CLI / tray app</p>
              <p className="mt-2 text-slate-300">This page already is the web runtime.</p>
            </div>
            <button
              type="button"
              className="secondary-button mt-4 w-full max-w-md rounded-xl text-xs"
              onClick={() => setMockPengineLocalReady(true)}
            >
              Mark Pengine local ready (demo)
            </button>
            {mockPengineLocalReady && (
              <p className="mt-3 font-mono text-xs text-cyan-300">
                Mock: local Pengine process active
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-cyan-200">
              What happens next
            </p>
            <p className="mt-3 text-sm text-slate-100">
              Next step connects your Telegram bot to this runtime using the bot ID
              extracted from your token.
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mono-label">Step 4</p>
            <h2 className="mt-2 text-3xl font-extrabold text-white">
              Connect bot to Pengine
            </h2>
            <p className="mt-3 subtle-copy">
              Pengine reads your <strong className="text-slate-200">bot ID</strong> from
              the token and pairs automatically. Scan the QR to open the bot in
              Telegram, or use the link. Then simulate the handshake (mock).
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4 font-mono text-sm text-slate-100">
              <p>
                Bot ID:{" "}
                <span className="text-(--yellow)">{botId ?? "— paste token in step 1"}</span>
              </p>
              {botId && (
                <p className="mt-2 text-xs text-(--mid)">
                  Auto-link target: <code className="text-slate-300">{botId}</code>
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <label
                htmlFor="bot-username-connect"
                className="font-mono text-xs uppercase tracking-[0.14em] text-(--mid)"
              >
                Bot username (for QR link)
              </label>
              <input
                id="bot-username-connect"
                className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 outline-none placeholder:text-(--dim) focus:border-cyan-300/40"
                value={botUsername}
                onChange={(event) => setBotUsername(event.target.value)}
                placeholder="@YourPengineBot"
              />
              <p className="mt-2 subtle-copy">
                Auto-link uses bot ID from your token; this field only sets where the QR
                points in Telegram.
              </p>
            </div>
            <div className="mt-6 flex justify-center rounded-3xl border border-white/10 bg-white p-5">
              <StyledQrCode value={telegramBotUrl} size={208} />
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-(--dim)">
              Scan to open Telegram (set username above for your bot chat)
            </p>
            <button
              type="button"
              className="secondary-button mt-6 w-full max-w-md rounded-xl text-xs"
              onClick={() => setMockBotLinked(true)}
            >
              Simulate bot linked to Pengine (demo)
            </button>
            {mockBotLinked && (
              <p className="mt-3 font-mono text-xs text-emerald-300">
                Mock: Telegram {"<->"} Pengine connected for bot {botId ?? "—"}
              </p>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-(--mid)">
                Direct link
              </p>
              <a
                href={telegramBotUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex break-all font-mono text-xs text-cyan-200"
              >
                {telegramBotUrl}
              </a>
            </div>
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
              <div className="space-y-3 font-mono text-sm text-slate-100">
                <p>✓ Bot token saved</p>
                <p>✓ Ollama (mock)</p>
                <p>✓ Pengine local (mock)</p>
                <p>{mockBotLinked ? "✓ Bot linked (mock)" : "○ Link pending"}</p>
              </div>
              {mockBotLinked && (
                <button
                  type="button"
                  className="primary-button mt-5 w-full rounded-xl text-xs"
                  onClick={onCompleteSetup}
                >
                  Open dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </WizardLayout>
  );
}

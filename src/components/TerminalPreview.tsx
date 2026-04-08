const lines = [
  ["[00:00:01]", "ok", "Pengine runtime booted"],
  ["[00:00:02]", "ok", "Telegram bot token accepted"],
  ["[00:00:03]", "run", "Waiting for your first message"],
  ["[00:00:08]", "msg", 'Incoming: "hello from my phone"'],
  ["[00:00:09]", "tool", "Routing to ollama -> llama3.2"],
];

export function TerminalPreview() {
  return (
    <section className="panel overflow-hidden" aria-label="Runtime preview">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-(--dim)">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <p className="ml-2">pengine runtime preview</p>
      </div>
      <div className="space-y-3 px-4 py-5 font-mono text-sm">
        {lines.map(([time, kind, message]) => (
          <div key={`${time}-${message}`} className="flex flex-wrap items-center gap-2">
            <span className="text-(--dim)">{time}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] ${
                kind === "ok"
                  ? "bg-emerald-400/10 text-emerald-300"
                  : kind === "run"
                    ? "bg-sky-400/10 text-sky-300"
                    : kind === "tool"
                      ? "bg-yellow-400/10 text-yellow-200"
                      : "bg-cyan-400/10 text-cyan-300"
              }`}
            >
              {kind}
            </span>
            <span className="text-slate-100">{message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

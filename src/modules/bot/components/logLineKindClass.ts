/** Shared pill colors for runtime + saved audit log lines. */
export function logLineKindClass(kind: string): string {
  if (kind === "ok") return "bg-emerald-400/10 text-emerald-300";
  if (kind === "run") return "bg-sky-400/10 text-sky-300";
  if (kind === "tool") return "bg-yellow-400/10 text-yellow-200";
  if (kind === "time") return "bg-fuchsia-400/10 text-fuchsia-200";
  if (kind === "reply") return "bg-violet-400/10 text-violet-300";
  if (kind === "msg") return "bg-cyan-400/10 text-cyan-300";
  return "bg-slate-400/10 text-slate-300";
}

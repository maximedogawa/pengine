import { useCallback, useEffect, useState } from "react";
import { auditDeleteFile, auditListFiles, auditReadFile } from "../api";
import type { AuditLogFileInfo } from "../types";
import { logLineKindClass } from "./logLineKindClass";

function inPengineShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { isTauri?: boolean; __TAURI_INTERNALS__?: object };
  return Boolean(w.__TAURI_INTERNALS__ ?? w.isTauri);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseNdjson(text: string): { timestamp: string; kind: string; message: string }[] {
  const rows: { timestamp: string; kind: string; message: string }[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      rows.push({
        timestamp: typeof o.timestamp === "string" ? o.timestamp : "—",
        kind: typeof o.kind === "string" ? o.kind : "—",
        message: typeof o.message === "string" ? o.message : t,
      });
    } catch {
      rows.push({ timestamp: "—", kind: "raw", message: t });
    }
  }
  return rows;
}

/** Daily audit files on disk: list, read, delete (Tauri only). */
export function AuditLogPanel() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<AuditLogFileInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState<ReturnType<typeof parseNdjson>>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setBusy(true);
    setError(false);
    const rows = await auditListFiles();
    if (rows === null) {
      setError(true);
      setFiles([]);
    } else {
      setFiles(rows);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  useEffect(() => {
    if (!selected) {
      setLines([]);
      setLoadingFile(false);
      return;
    }
    let alive = true;
    setLoadingFile(true);
    void auditReadFile(selected).then(
      (text) => {
        if (!alive) return;
        setLines(text ? parseNdjson(text) : []);
        setLoadingFile(false);
      },
      () => {
        if (!alive) return;
        setLines([]);
        setLoadingFile(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [selected]);

  useEffect(() => {
    if (selected && !files.some((f) => f.date === selected)) {
      setSelected(null);
    }
  }, [files, selected]);

  if (!inPengineShell()) {
    return null;
  }

  return (
    <section className="panel overflow-hidden" aria-label="Saved audit logs">
      <button
        type="button"
        className="flex w-full items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3 text-left font-mono text-xs text-(--dim) transition hover:bg-white/[0.07]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`text-slate-400 transition ${open ? "rotate-90" : ""}`}>{"\u25B8"}</span>
        <span className="text-slate-200">Saved audit logs</span>
        {open && !busy && !error && (
          <span className="ml-auto text-[10px] text-white/40">{files.length} file(s)</span>
        )}
        {open && busy && <span className="ml-auto text-[10px] text-white/40">Loading…</span>}
        {open && error && <span className="ml-auto text-[10px] text-rose-300/80">Failed</span>}
      </button>

      {open && (
        <div className="p-4">
          {error && (
            <p className="mb-3 text-xs text-rose-300">
              Could not load files.{" "}
              <button
                type="button"
                className="underline decoration-rose-300/50 hover:text-rose-200"
                onClick={() => void loadList()}
              >
                Retry
              </button>
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void loadList()}
            className="mb-3 rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            Refresh
          </button>

          {!error && files.length === 0 && !busy && (
            <p className="text-xs text-white/40">No audit files yet.</p>
          )}

          {files.length > 0 && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {files.map((f) => (
                  <li
                    key={f.date}
                    className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                      selected === f.date ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-slate-200"
                      onClick={() => setSelected(f.date)}
                    >
                      {f.date} <span className="text-white/40">({fmtBytes(f.size_bytes)})</span>
                    </button>
                    <button
                      type="button"
                      disabled={deleting !== null}
                      className="shrink-0 text-[10px] text-rose-300/80 hover:text-rose-200 disabled:opacity-40"
                      onClick={async () => {
                        if (!window.confirm(`Delete log for ${f.date}?`)) return;
                        setDeleting(f.date);
                        const ok = await auditDeleteFile(f.date);
                        setDeleting(null);
                        if (ok) {
                          if (selected === f.date) setSelected(null);
                          void loadList();
                        }
                      }}
                    >
                      {deleting === f.date ? "…" : "Del"}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="min-h-[10rem] rounded border border-white/10 bg-black/30 p-2 font-mono text-[11px]">
                {!selected && <p className="text-white/35">Select a date.</p>}
                {selected && loadingFile && <p className="text-white/40">Loading…</p>}
                {selected && !loadingFile && lines.length === 0 && (
                  <p className="text-white/40">Empty or unreadable.</p>
                )}
                {lines.map((row, i) => (
                  <div key={i} className="mb-2 flex flex-wrap gap-1.5 border-b border-white/5 pb-2">
                    <span className="text-[10px] text-(--dim)">{row.timestamp}</span>
                    <span
                      className={`rounded px-1.5 py-0 text-[9px] uppercase ${logLineKindClass(row.kind)}`}
                    >
                      {row.kind}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-200">{row.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

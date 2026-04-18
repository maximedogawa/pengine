import { useCallback, useEffect, useRef, useState } from "react";
import { PENGINE } from "../api";
import { logLineKindClass } from "./logLineKindClass";

type LogLine = { timestamp: string; kind: string; message: string };

const fallbackLines: LogLine[] = [
  { timestamp: "00:00:00", kind: "ok", message: "Waiting for Pengine service…" },
];

const SCROLL_NEAR_BOTTOM_PX = 64;

export function TerminalPreview() {
  const [lines, setLines] = useState<LogLine[]>(fallbackLines);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLine = useCallback((line: LogLine) => {
    setLines((prev) => [...prev.slice(-49), line]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let es: EventSource | null = null;
    let unlistenTauri: (() => void) | null = null;

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleSseReconnect = () => {
      clearRetry();
      if (cancelled) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 10));
      reconnectAttempt += 1;
      retryTimer = setTimeout(() => {
        openEventSource();
      }, delay);
    };

    const openEventSource = () => {
      if (cancelled) return;
      es?.close();
      const next = new EventSource(PENGINE.logs);
      es = next;

      next.onopen = () => {
        reconnectAttempt = 0;
      };

      next.onmessage = (event) => {
        if (cancelled) return;
        try {
          const entry: LogLine = JSON.parse(event.data);
          addLine(entry);
        } catch {
          // ignore malformed events
        }
      };

      next.onerror = () => {
        next.close();
        if (!cancelled) scheduleSseReconnect();
      };
    };

    async function connect() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<LogLine>("pengine-log", (event) => {
          if (!cancelled) addLine(event.payload);
        });
        unlistenTauri = unlisten;
        return;
      } catch {
        // Not running inside Tauri — fall through to SSE
      }

      openEventSource();
    }

    void connect();

    return () => {
      cancelled = true;
      clearRetry();
      es?.close();
      unlistenTauri?.();
    };
  }, [addLine]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    if (distanceFromBottom <= SCROLL_NEAR_BOTTOM_PX) {
      el.scrollTo({ top: scrollHeight, behavior: "smooth" });
    }
  }, [lines]);

  return (
    <section className="panel overflow-hidden" aria-label="Runtime preview">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-(--dim)">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <p className="ml-2">pengine runtime</p>
        <span className="ml-auto hidden text-[10px] uppercase tracking-[0.14em] text-white/35 sm:inline">
          live
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-56 space-y-2.5 overflow-y-auto px-3 py-4 font-mono text-xs sm:h-60 sm:space-y-3 sm:px-4 sm:py-5 sm:text-sm"
      >
        {lines.map((line, i) => (
          <div key={`${line.timestamp}-${i}`} className="flex flex-wrap items-center gap-2">
            <span className="text-(--dim)">[{line.timestamp}]</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] ${logLineKindClass(line.kind)}`}
            >
              {line.kind}
            </span>
            <span className="text-slate-100">{line.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

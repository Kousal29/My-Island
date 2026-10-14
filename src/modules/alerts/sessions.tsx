import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, FileCode2, MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cx, timeAgo } from "../../lib/util";
import { focusSession, hostName, isInternalPrompt, sessionSummary, useAgents, type AgentSession } from "../../state/agents";
import { IconButton, Marquee, spring } from "../../ui/primitives";

const CLAUDE = "#d97757";
export const sourceColor = (source: string) => (/claude/i.test(source) ? CLAUDE : "var(--accent)");

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

function useSecondTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** Claude-style starburst: spins while working, pulses amber while waiting, check when done. */
export function AgentSpinner({ state, color, size = 22 }: { state: AgentSession["state"]; color: string; size?: number }) {
  if (state === "done")
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-good text-black" style={{ width: size, height: size }}>
        <Check size={size * 0.6} strokeWidth={3} />
      </span>
    );
  if (state === "waiting")
    return (
      <span className="relative grid shrink-0 place-items-center rounded-full bg-warn text-black" style={{ width: size, height: size }}>
        <MessageCircleQuestion size={size * 0.62} />
        <span className="absolute inset-0 animate-ping rounded-full bg-warn/50" style={{ animationDuration: "1.6s" }} />
      </span>
    );
  return (
    // Ticks in 8 steps (~3 repaints/s) instead of spinning at 60fps: agent sessions can run for
    // hours and a smooth spinner would keep the GPU busy the whole time.
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" style={{ animation: "spin 2.4s steps(8) infinite", color }}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="11" y="1.5" width="2" height="7.5" rx="1" fill="currentColor" opacity={0.35 + (i / 8) * 0.65} transform={`rotate(${i * 45} 12 12)`} />
      ))}
    </svg>
  );
}

/** Most relevant session for the pill: anything waiting on you first, then the busiest. */
export function useSessionActivity() {
  const sessions = useAgents((s) => s.sessions);
  const live = Object.values(sessions).filter((s) => s.state !== "done");
  useSecondTick(live.length > 0);
  if (!live.length) return null;
  const waiting = live.filter((s) => s.state === "waiting").sort((a, b) => b.lastAt - a.lastAt)[0];
  const s = waiting ?? live.sort((a, b) => b.lastAt - a.lastAt)[0];
  const others = live.length - 1;
  const color = sourceColor(s.source);
  const label = `${s.source}${s.project ? ` · ${s.project}` : ""}`;

  if (s.state === "waiting") {
    return {
      priority: 91,
      width: 410,
      opens: "alerts",
      // Clicking takes you to the terminal/IDE so you can answer right away.
      onClick: s.window ? () => focusSession(s) : undefined,
      left: <AgentSpinner state="waiting" color={color} size={22} />,
      center: (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[11.5px] font-semibold text-warn">Needs your input · {s.project || s.source}</span>
          <Marquee text={s.message || "Waiting for you to respond"} className="max-w-[230px] text-[10.5px] text-ink-2" />
        </span>
      ),
      right: s.window ? (
        <span className="flex items-center gap-1 rounded-full bg-warn px-2 py-0.5 text-[10.5px] font-semibold text-black">
          {hostName(s.host)} <ArrowUpRight size={11} strokeWidth={2.6} />
        </span>
      ) : (
        <span className="tabular text-[11px] font-semibold text-ink-3">{elapsed(Date.now() - s.lastAt)}</span>
      ),
    };
  }
  return {
    priority: 44,
    width: 380,
    opens: "alerts",
    left: <AgentSpinner state="working" color={color} size={20} />,
    center: (
      <span className="flex min-w-0 flex-col leading-tight">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={s.detail}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="block truncate text-[11.5px] font-semibold text-ink"
          >
            {s.detail}
          </motion.span>
        </AnimatePresence>
        <span className="truncate text-[10.5px] text-ink-3">{label}</span>
      </span>
    ),
    right: (
      <span className="flex items-center gap-1.5">
        {others > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-ink-2">+{others}</span>}
        <span className="tabular text-[11.5px] font-semibold" style={{ color }}>
          {elapsed(Date.now() - s.startedAt)}
        </span>
      </span>
    ),
  };
}

export function SessionCard({ s }: { s: AgentSession }) {
  const dismiss = useAgents((x) => x.dismiss);
  useSecondTick(s.state !== "done");
  const color = sourceColor(s.source);
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={spring}
      className={cx(
        "group rounded-2xl p-3 ring-1",
        s.state === "waiting" ? "bg-warn/[0.07] ring-warn/25" : s.state === "done" ? "bg-good/[0.05] ring-good/15" : "bg-white/[0.045] ring-white/[0.06]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <AgentSpinner state={s.state} color={color} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold">{s.project || s.source}</span>
            <span className="shrink-0 text-[10.5px]" style={{ color }}>
              {s.source}
            </span>
          </div>
          <div className={cx("truncate text-[11px]", s.state === "waiting" ? "text-warn" : "text-ink-3")}>
            {s.state === "done" ? ["Finished", sessionSummary(s)].filter(Boolean).join(" · ") : s.state === "waiting" ? s.message || "Needs your input" : s.detail}
          </div>
        </div>
        {s.window !== 0 && s.state !== "done" && (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => focusSession(s)}
            className={cx(
              "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              s.state === "waiting" ? "bg-warn text-black" : "bg-white/9 text-ink-2 hover:bg-white/14 hover:text-ink",
            )}
            title={`Bring ${hostName(s.host)} to the front`}
          >
            {s.state === "waiting" ? "Answer in" : "Open"} {hostName(s.host)} <ArrowUpRight size={11} strokeWidth={2.6} />
          </motion.button>
        )}
        <span className="tabular shrink-0 text-[11px] text-ink-3">{s.state === "done" ? timeAgo(s.endedAt ?? s.lastAt) : elapsed(Date.now() - s.startedAt)}</span>
        <IconButton label="Dismiss" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => dismiss(s.id)}>
          <X size={12} />
        </IconButton>
      </div>

      {s.prompt && !isInternalPrompt(s.prompt) && <div className="mt-2 line-clamp-2 border-l-2 pl-2 text-[11px] text-ink-2 italic" style={{ borderColor: color }}>“{s.prompt}”</div>}

      {s.actions.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {s.actions.slice(-4).map((a, i, arr) => {
            const current = i === arr.length - 1 && s.state === "working";
            return (
              <motion.div key={`${a.at}-${i}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-[10.5px]">
                <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", current ? "animate-[breathe_1.2s_ease-in-out_infinite]" : "")} style={{ background: current ? color : "rgb(255 255 255 / 0.25)" }} />
                <span className={cx("min-w-0 flex-1 truncate", current ? "text-ink" : "text-ink-3")}>{a.detail}</span>
              </motion.div>
            );
          })}
        </div>
      )}

      {s.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {s.files.slice(0, 6).map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full bg-white/7 px-2 py-0.5 text-[10px] text-ink-2">
              <FileCode2 size={10} /> {f}
            </span>
          ))}
          {s.files.length > 6 && <span className="px-1 text-[10px] text-ink-4">+{s.files.length - 6}</span>}
        </div>
      )}
    </motion.div>
  );
}

export function SessionsSection() {
  const sessions = useAgents((s) => s.sessions);
  const list = Object.values(sessions).sort((a, b) => {
    const rank = (x: AgentSession) => (x.state === "waiting" ? 0 : x.state === "working" ? 1 : 2);
    return rank(a) - rank(b) || b.lastAt - a.lastAt;
  });
  if (!list.length) return null;
  return (
    <div className="mb-2 space-y-1.5">
      <div className="px-1 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Agent sessions</div>
      <AnimatePresence initial={false}>
        {list.map((s) => (
          <SessionCard key={s.id} s={s} />
        ))}
      </AnimatePresence>
    </div>
  );
}

import { AnimatePresence, motion } from "motion/react";
import { Coffee, Pause, Play, Plus, RotateCcw, Square, Timer as TimerIcon, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { cx, formatDuration } from "../../lib/util";
import { timerActive, timerRemaining, useTimer, type Phase } from "../../state/timer";
import { Button, IconButton, Ring, Toggle, bouncy } from "../../ui/primitives";
import type { IslandModule } from "../types";

const PHASE_COLOR: Record<Phase, string> = { focus: "var(--accent)", short: "#3fe0b0", long: "#4fb4ff" };

export function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

function TimerView() {
  const t = useTimer();
  const active = timerActive(t);
  const now = useNow(t.running);
  const remaining = timerRemaining(t, now);
  const progress = t.durationMs ? 1 - remaining / t.durationMs : 0;
  const [custom, setCustom] = useState("");
  const color = PHASE_COLOR[t.phase];
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = t.history.find((h) => h.day === todayKey);
  const week = t.history.slice(-7);
  const maxMs = Math.max(1, ...week.map((h) => h.focusMs));

  const startPhase = (phase: Phase) => {
    const mins = phase === "focus" ? t.focusMin : phase === "short" ? t.shortMin : t.longMin;
    t.start(mins, phase === "focus" ? "Focus" : phase === "short" ? "Short break" : "Long break", phase);
  };

  return (
    <div className="flex h-full gap-6 px-2">
      <div className="flex flex-col items-center justify-center gap-3">
        <Ring value={active ? progress : 0} size={150} stroke={9} color={color}>
          <div className="flex flex-col items-center">
            <AnimatePresence mode="popLayout">
              <motion.span key={t.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[10.5px] font-semibold tracking-[0.1em] uppercase" style={{ color }}>
                {t.label}
              </motion.span>
            </AnimatePresence>
            <span className="tabular font-display text-[34px] leading-none font-semibold">
              {formatDuration(active ? remaining : (t.phase === "focus" ? t.focusMin : t.phase === "short" ? t.shortMin : t.longMin) * 60000)}
            </span>
            {t.pomodoro && (
              <div className="mt-2 flex gap-1">
                {Array.from({ length: t.longEvery }, (_, i) => (
                  <motion.span
                    key={i}
                    animate={{ scale: i === t.cycle % t.longEvery && t.phase === "focus" && t.running ? [1, 1.4, 1] : 1 }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: i < t.cycle % t.longEvery ? color : "rgb(255 255 255 / 0.18)" }}
                  />
                ))}
              </div>
            )}
          </div>
        </Ring>
        <div className="flex items-center gap-2">
          {active ? (
            <>
              <IconButton label="Reset" onClick={t.stop}>
                <Square size={14} fill="currentColor" />
              </IconButton>
              <IconButton label={t.running ? "Pause" : "Resume"} tone="solid" size="lg" onClick={t.running ? t.pause : t.resume}>
                {t.running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </IconButton>
              <IconButton label="Add 5 minutes" onClick={() => t.addTime(5)}>
                <Plus size={15} />
              </IconButton>
            </>
          ) : (
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={bouncy}>
              <Button tone="accent" size="lg" onClick={() => startPhase(t.phase)}>
                <Play size={15} fill="currentColor" /> Start {t.phase === "focus" ? "focus" : "break"}
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Quick start</div>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 15, 25, 50].map((m) => (
              <motion.button
                key={m}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.93 }}
                transition={bouncy}
                onClick={() => t.start(m, `${m} min`)}
                className="rounded-xl bg-white/6 py-2 text-center hover:bg-white/10"
              >
                <div className="tabular text-[15px] font-semibold">{m}</div>
                <div className="text-[9.5px] text-ink-3">min</div>
              </motion.button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && +custom > 0 && (t.start(+custom, `${custom} min`), setCustom(""))}
              placeholder="Custom minutes"
              className="h-8 min-w-0 flex-1 rounded-xl bg-white/6 px-2.5 text-[12px] outline-none placeholder:text-ink-4 focus:bg-white/9"
            />
            <Button size="md" disabled={!(+custom > 0)} onClick={() => (t.start(+custom, `${custom} min`), setCustom(""))}>
              Go
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2">
          <div className="flex items-center gap-2 text-[12px]">
            <Zap size={14} className="text-[var(--accent-ink)]" /> Pomodoro cycle
            <span className="text-ink-3">{t.focusMin}/{t.shortMin}/{t.longMin}</span>
          </div>
          <Toggle checked={t.pomodoro} onChange={(v) => t.setPrefs({ pomodoro: v })} label="Pomodoro" />
        </div>
        {t.pomodoro && (
          <div className="flex gap-1.5">
            {(["focus", "short", "long"] as Phase[]).map((p) => (
              <button
                key={p}
                onClick={() => startPhase(p)}
                className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11.5px] transition-colors", t.phase === p ? "bg-white/12 text-ink" : "bg-white/5 text-ink-3 hover:text-ink-2")}
              >
                {p === "focus" ? <Zap size={12} /> : <Coffee size={12} />}
                {p === "focus" ? "Focus" : p === "short" ? "Short" : "Long"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">This week</span>
            <span className="text-[11px] text-ink-3">
              Today <b className="text-ink-2">{Math.round((today?.focusMs ?? 0) / 60000)}m</b> · {today?.sessions ?? 0} sessions
            </span>
          </div>
          <div className="flex h-10 items-end gap-1">
            {week.length === 0 && <div className="text-[11px] text-ink-4">Complete a focus session to start your streak</div>}
            {week.map((h) => (
              <div key={h.day} className="flex flex-1 flex-col items-center gap-1" title={`${h.day}: ${Math.round(h.focusMs / 60000)} min`}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(8, (h.focusMs / maxMs) * 100)}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="w-full max-w-5 rounded-md"
                  style={{ background: h.day === todayKey ? "var(--accent)" : "rgb(255 255 255 / 0.18)" }}
                />
              </div>
            ))}
          </div>
        </div>
        {t.cycle > 0 && (
          <button onClick={() => useTimer.setState({ cycle: 0, phase: "focus", label: "Focus" })} className="flex items-center gap-1 self-end text-[10.5px] text-ink-4 hover:text-ink-2">
            <RotateCcw size={10} /> Reset cycle
          </button>
        )}
      </div>
    </div>
  );
}

function useTimerActivity() {
  const t = useTimer();
  const active = timerActive(t);
  const now = useNow(active && t.running, 500);
  if (!active) return null;
  const remaining = timerRemaining(t, now);
  const color = PHASE_COLOR[t.phase];
  return {
    priority: 50,
    width: 230,
    opens: "timer",
    left: (
      <Ring value={t.durationMs ? 1 - remaining / t.durationMs : 0} size={20} stroke={3} color={color}>
        {!t.running && <Pause size={8} fill="currentColor" />}
      </Ring>
    ),
    center: <span className="text-[11.5px] font-medium text-ink-3">{t.label}</span>,
    right: (
      <span className={cx("tabular text-[13px] font-semibold", !t.running && "animate-[breathe_1.6s_ease-in-out_infinite]")} style={{ color }}>
        {formatDuration(remaining)}
      </span>
    ),
  };
}

export const timerModule: IslandModule = {
  id: "timer",
  title: "Focus",
  icon: TimerIcon,
  size: { w: 600, h: 300 },
  View: TimerView,
  useActivity: useTimerActivity,
  description: "Focus timer with pomodoro cycles, quick presets and a weekly focus chart.",
};

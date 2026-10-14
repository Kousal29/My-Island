import { create } from "zustand";
import { persist } from "../lib/persist";
import { bus } from "../lib/bus";
import { play } from "../lib/sound";

export type Phase = "focus" | "short" | "long";

interface TimerState {
  running: boolean;
  phase: Phase;
  label: string;
  durationMs: number;
  /** Wall-clock end while running; remaining ms while paused. */
  endsAt: number;
  remainingMs: number;
  pomodoro: boolean;
  cycle: number;
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;
  autoStartNext: boolean;
  history: { day: string; focusMs: number; sessions: number }[];
  start: (minutes: number, label?: string, phase?: Phase) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  addTime: (minutes: number) => void;
  setPrefs: (p: Partial<Pick<TimerState, "pomodoro" | "focusMin" | "shortMin" | "longMin" | "longEvery" | "autoStartNext">>) => void;
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export const useTimer = create<TimerState>((set, get) => ({
  running: false,
  phase: "focus",
  label: "Focus",
  durationMs: 0,
  endsAt: 0,
  remainingMs: 0,
  pomodoro: true,
  cycle: 0,
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartNext: false,
  history: [],
  start: (minutes, label = "Focus", phase = "focus") => {
    const ms = Math.round(minutes * 60000);
    set({ running: true, phase, label, durationMs: ms, endsAt: Date.now() + ms, remainingMs: ms });
    bus.emit("timer:started", { minutes });
    play("pop");
  },
  pause: () => {
    const s = get();
    if (!s.running) return;
    set({ running: false, remainingMs: Math.max(0, s.endsAt - Date.now()) });
  },
  resume: () => {
    const s = get();
    if (s.running || s.remainingMs <= 0) return;
    set({ running: true, endsAt: Date.now() + s.remainingMs });
  },
  stop: () => set({ running: false, durationMs: 0, remainingMs: 0, endsAt: 0 }),
  addTime: (minutes) => {
    const s = get();
    const ms = minutes * 60000;
    if (s.running) set({ endsAt: s.endsAt + ms, durationMs: s.durationMs + ms });
    else if (s.remainingMs > 0) set({ remainingMs: s.remainingMs + ms, durationMs: s.durationMs + ms });
  },
  setPrefs: (p) => set(p),
}));

export const timerRemaining = (s: Pick<TimerState, "running" | "endsAt" | "remainingMs">, now = Date.now()) =>
  s.running ? Math.max(0, s.endsAt - now) : s.remainingMs;

export const timerActive = (s: Pick<TimerState, "running" | "remainingMs" | "durationMs">) =>
  s.running || (s.remainingMs > 0 && s.durationMs > 0);

function complete() {
  const s = useTimer.getState();
  const finished = s.phase;
  const label = s.label;
  let history = s.history;
  let cycle = s.cycle;
  if (finished === "focus") {
    cycle++;
    const key = dayKey();
    const today = history.find((h) => h.day === key);
    history = today
      ? history.map((h) => (h.day === key ? { ...h, focusMs: h.focusMs + s.durationMs, sessions: h.sessions + 1 } : h))
      : [...history.slice(-29), { day: key, focusMs: s.durationMs, sessions: 1 }];
  }
  useTimer.setState({ running: false, remainingMs: 0, durationMs: 0, cycle, history });
  play("chime");
  bus.emit("timer:done", { label });

  if (s.pomodoro) {
    const next: Phase = finished === "focus" ? (cycle % s.longEvery === 0 ? "long" : "short") : "focus";
    const mins = next === "focus" ? s.focusMin : next === "short" ? s.shortMin : s.longMin;
    const nextLabel = next === "focus" ? "Focus" : next === "short" ? "Short break" : "Long break";
    if (s.autoStartNext) useTimer.getState().start(mins, nextLabel, next);
    else useTimer.setState({ phase: next, label: nextLabel });
  }
}

export function startTimerLoop() {
  const id = setInterval(() => {
    const s = useTimer.getState();
    if (s.running && Date.now() >= s.endsAt) complete();
  }, 250);
  return () => clearInterval(id);
}

export const hydrateTimer = () =>
  persist(useTimer, {
    key: "timer",
    version: 1,
    pick: (s) => ({
      running: s.running, phase: s.phase, label: s.label, durationMs: s.durationMs, endsAt: s.endsAt,
      remainingMs: s.remainingMs, pomodoro: s.pomodoro, cycle: s.cycle, focusMin: s.focusMin, shortMin: s.shortMin,
      longMin: s.longMin, longEvery: s.longEvery, autoStartNext: s.autoStartNext, history: s.history,
    }),
    apply: (d) => d,
  });

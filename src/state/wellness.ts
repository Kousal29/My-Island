import { create } from "zustand";
import { api } from "../lib/bridge";
import { persist } from "../lib/persist";
import { useAlerts } from "./alerts";
import { useIsland } from "./island";

export type Reminder = "water" | "break" | "eyes";

interface ReminderPrefs { enabled: boolean; everyMin: number }

interface WellnessState {
  water: ReminderPrefs & { goal: number };
  break: ReminderPrefs;
  eyes: ReminderPrefs;
  pauseInCalls: boolean;
  /** Last time each reminder was satisfied (or snoozed into the future). */
  last: Record<Reminder, number>;
  /** day (YYYY-MM-DD) → glasses */
  waterLog: Record<string, number>;
  breaksToday: { day: string; count: number };
  /** Reminder currently asking for attention. */
  due: Reminder | null;
  /** 20-20-20 countdown end (ms) while an eye break is running. */
  eyeBreakUntil: number;
  set: (patch: Partial<WellnessState>) => void;
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const useWellness = create<WellnessState>((set) => ({
  water: { enabled: true, everyMin: 60, goal: 8 },
  break: { enabled: true, everyMin: 50 },
  eyes: { enabled: true, everyMin: 20 },
  pauseInCalls: true,
  last: { water: Date.now(), break: Date.now(), eyes: Date.now() },
  waterLog: {},
  breaksToday: { day: dayKey(), count: 0 },
  due: null,
  eyeBreakUntil: 0,
  set: (patch) => set(patch),
}));

export const glassesToday = (s: Pick<WellnessState, "waterLog">) => s.waterLog[dayKey()] ?? 0;

export function nextDue(s: WellnessState, r: Reminder) {
  return s.last[r] + s[r].everyMin * 60_000;
}

export function logWater(delta = 1) {
  const s = useWellness.getState();
  const k = dayKey();
  const v = Math.max(0, (s.waterLog[k] ?? 0) + delta);
  // Keep a rolling 30 days.
  const keys = Object.keys(s.waterLog).sort().slice(-29);
  const log: Record<string, number> = {};
  keys.forEach((d) => (log[d] = s.waterLog[d]));
  log[k] = v;
  s.set({ waterLog: log, last: { ...s.last, water: Date.now() }, due: s.due === "water" ? null : s.due });
}

export function takeBreak() {
  const s = useWellness.getState();
  const today = dayKey();
  const count = s.breaksToday.day === today ? s.breaksToday.count + 1 : 1;
  s.set({ breaksToday: { day: today, count }, last: { ...s.last, break: Date.now() }, due: s.due === "break" ? null : s.due });
}

export function startEyeBreak() {
  const s = useWellness.getState();
  s.set({ eyeBreakUntil: Date.now() + 20_000, last: { ...s.last, eyes: Date.now() }, due: s.due === "eyes" ? null : s.due });
}

export function snooze(r: Reminder, minutes = 10) {
  const s = useWellness.getState();
  // Pretend it was satisfied such that it comes due again in `minutes`.
  s.set({ last: { ...s.last, [r]: Date.now() - (s[r].everyMin - minutes) * 60_000 }, due: s.due === r ? null : s.due });
}

/**
 * Checks reminders every 15s. Pauses during calls and fullscreen, and treats time away
 * from the keyboard (5+ min) as a break: everything resets when you come back.
 */
export function startWellnessLoop(onDue: (r: Reminder) => void, onEyeBreakDone: () => void) {
  let away = false;
  const tick = async () => {
    const s = useWellness.getState();
    const now = Date.now();
    if (s.eyeBreakUntil && now >= s.eyeBreakUntil) {
      s.set({ eyeBreakUntil: 0 });
      onEyeBreakDone();
    }
    const idle = await api.idleSeconds();
    if (idle > 300) {
      away = true;
      return;
    }
    if (away) {
      away = false;
      s.set({ last: { water: s.last.water, break: now, eyes: now }, due: null });
      return;
    }
    if (s.due || s.eyeBreakUntil) return;
    if (useIsland.getState().fullscreenHidden) return;
    if (s.pauseInCalls && useAlerts.getState().call?.meeting) return;
    for (const r of ["eyes", "break", "water"] as Reminder[]) {
      if (s[r].enabled && now >= nextDue(s, r)) {
        s.set({ due: r });
        onDue(r);
        return;
      }
    }
  };
  const id = setInterval(() => void tick(), 15_000);
  const fast = setInterval(() => {
    const s = useWellness.getState();
    if (s.eyeBreakUntil && Date.now() >= s.eyeBreakUntil) void tick();
  }, 500);
  return () => {
    clearInterval(id);
    clearInterval(fast);
  };
}

export const hydrateWellness = () =>
  persist(useWellness, {
    key: "wellness",
    version: 1,
    pick: (s) => ({ water: s.water, break: s.break, eyes: s.eyes, pauseInCalls: s.pauseInCalls, waterLog: s.waterLog, breaksToday: s.breaksToday }),
    apply: (d) => d,
  });

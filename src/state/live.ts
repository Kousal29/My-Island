import { create } from "zustand";
import { api, on, type MediaState, type Stats } from "../lib/bridge";
import { bus } from "../lib/bus";

const HISTORY = 60;

interface LiveState {
  media: MediaState | null;
  volume: { level: number; muted: boolean };
  stats: Stats | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: { down: number; up: number }[];
}

export const useLive = create<LiveState>(() => ({
  media: null,
  volume: { level: 0.5, muted: false },
  stats: null,
  cpuHistory: [],
  memHistory: [],
  netHistory: [],
}));

const push = <T,>(arr: T[], v: T) => (arr.length >= HISTORY ? [...arr.slice(1), v] : [...arr, v]);

export function startLiveFeeds() {
  const offs = [
    on("media://update", (m) => {
      const prev = useLive.getState().media;
      if (m.playing && (!prev?.playing || prev.title !== m.title)) bus.emit("media:started", null);
      useLive.setState({ media: m.active ? m : null });
    }),
    on("stats://update", (s) => {
      const prev = useLive.getState().stats;
      if (prev && s.battery.present) {
        if (s.battery.plugged && !prev.battery.plugged) bus.emit("battery:plugged", { percent: s.battery.percent });
        if (!s.battery.plugged && s.battery.percent <= 20 && (prev.battery.percent > 20 || prev.battery.plugged))
          bus.emit("battery:low", { percent: s.battery.percent });
      }
      useLive.setState((st) => ({
        stats: s,
        cpuHistory: push(st.cpuHistory, s.cpu),
        memHistory: push(st.memHistory, s.memTotal ? (s.memUsed / s.memTotal) * 100 : 0),
        netHistory: push(st.netHistory, { down: s.netDown, up: s.netUp }),
      }));
    }),
  ];
  void api.getVolume().then((volume) => useLive.setState({ volume }));
  return () => offs.forEach((f) => f());
}

/** Current playback position, extrapolated between backend samples. */
export function livePosition(m: MediaState, now = Date.now()) {
  const pos = m.playing ? m.positionMs + (now - m.sampledAt) : m.positionMs;
  return m.durationMs ? Math.min(pos, m.durationMs) : pos;
}

let volTimer: ReturnType<typeof setTimeout> | undefined;
export function changeVolume(level: number) {
  const v = Math.round(Math.min(1, Math.max(0, level)) * 100) / 100;
  useLive.setState({ volume: { level: v, muted: v === 0 } });
  clearTimeout(volTimer);
  volTimer = setTimeout(() => void api.setVolume(v), 16);
}

import { create } from "zustand";
import type { ReactNode } from "react";

/**
 * Transient "live activities" that briefly take over the collapsed island
 * (volume HUD, copied!, task done, charger plugged…). Highest priority wins.
 */
export interface Transient {
  id: string;
  priority: number;
  ttl: number;
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  width?: number;
  opens?: string;
  expiresAt: number;
}

interface ActivityState {
  transients: Transient[];
  show: (t: Omit<Transient, "expiresAt">) => void;
  dismiss: (id: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useActivities = create<ActivityState>((set, get) => ({
  transients: [],
  show: (t) => {
    const expiresAt = Date.now() + t.ttl;
    set({ transients: [...get().transients.filter((x) => x.id !== t.id), { ...t, expiresAt }] });
    clearTimeout(timers.get(t.id));
    timers.set(t.id, setTimeout(() => get().dismiss(t.id), t.ttl));
  },
  dismiss: (id) => set({ transients: get().transients.filter((x) => x.id !== id) }),
}));

export const showActivity = (t: Omit<Transient, "expiresAt">) => useActivities.getState().show(t);

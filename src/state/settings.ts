import { create } from "zustand";
import { persist } from "../lib/persist";

export type IslandStyle = "notch" | "pill";
export type PetKind = "cat" | "dog";

export const ACCENTS = {
  violet: "#8b7bff",
  sky: "#4fb4ff",
  mint: "#3fe0b0",
  peach: "#ff9f6e",
  rose: "#ff6f9c",
  lemon: "#ffd24a",
} as const;
export type AccentName = keyof typeof ACCENTS;

export interface SettingsState {
  islandStyle: IslandStyle;
  expandOnHover: boolean;
  hoverDelay: number;
  collapseDelay: number;
  showClock: boolean;
  showPetInPill: boolean;
  accent: AccentName;
  useArtworkAccent: boolean;
  sounds: boolean;
  monitor: number;
  autohideFullscreen: boolean;
  clipboardCapture: boolean;
  clipHistoryLimit: number;
  linkPreviews: boolean;
  moduleOrder: string[];
  disabledModules: string[];
  reduceMotion: boolean;
  onboarded: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const DEFAULT_MODULE_ORDER = ["home", "media", "todos", "stash", "timer", "stats", "pet"];

export const useSettings = create<SettingsState>((set) => ({
  islandStyle: "notch",
  expandOnHover: false,
  hoverDelay: 350,
  collapseDelay: 450,
  showClock: true,
  showPetInPill: true,
  accent: "violet",
  useArtworkAccent: true,
  sounds: true,
  monitor: -1,
  autohideFullscreen: true,
  clipboardCapture: true,
  clipHistoryLimit: 200,
  linkPreviews: true,
  moduleOrder: DEFAULT_MODULE_ORDER,
  disabledModules: [],
  reduceMotion: false,
  onboarded: false,
  set: (patch) => set(patch),
}));

export const hydrateSettings = () =>
  persist(useSettings, {
    key: "settings",
    version: 1,
    pick: ({ set: _s, ...rest }) => rest,
    apply: (d) => {
      // Keep module order valid when new modules ship in later versions.
      const known = new Set(DEFAULT_MODULE_ORDER);
      const order = (d.moduleOrder ?? []).filter((m: string) => known.has(m));
      DEFAULT_MODULE_ORDER.forEach((m) => order.includes(m) || order.push(m));
      return { ...d, moduleOrder: order };
    },
  });

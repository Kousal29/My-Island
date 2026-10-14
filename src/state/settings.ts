import { create } from "zustand";
import { persist } from "../lib/persist";

export type IslandStyle = "notch" | "pill";
export type PetKind = "cat" | "dog";

export type HomeWidgetId = "media" | "tasks" | "focus" | "stats" | "water" | "agents" | "recent";
export interface HomeLayout {
  greeting: boolean;
  showDate: boolean;
  showPet: boolean;
  clock24: boolean;
  widgets: { id: HomeWidgetId; on: boolean }[];
}
export const DEFAULT_HOME: HomeLayout = {
  greeting: true,
  showDate: true,
  showPet: true,
  clock24: false,
  widgets: [
    { id: "media", on: true },
    { id: "tasks", on: true },
    { id: "focus", on: true },
    { id: "stats", on: true },
    { id: "water", on: false },
    { id: "agents", on: false },
    { id: "recent", on: false },
  ],
};

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
  /** User shrank the island to a slim bar (hover the bar to bring it back). */
  minimized: boolean;
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
  home: HomeLayout;
  /** The pet's eyes track the mouse pointer. */
  petEyesFollow: boolean;
  /** Auto-clear notification history after this long ("never" keeps it, capped at 120). */
  alertRetention: "1h" | "24h" | "7d" | "never";
  /** Remove finished agent sessions after this long. */
  sessionRetention: "5m" | "15m" | "1h" | "never";
  /** Show Windows notifications from other apps in the island. */
  mirrorNotifications: boolean;
  /** Keep the pet / island out of screen shares and recordings. */
  hidePetFromCapture: boolean;
  hideIslandFromCapture: boolean;
  onboarded: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const RETENTION_MS: Record<string, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "1h": 3_600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, never: Infinity };

export const DEFAULT_MODULE_ORDER = ["home", "media", "todos", "stash", "timer", "wellness", "alerts", "stats", "pet"];

export const useSettings = create<SettingsState>((set) => ({
  islandStyle: "notch",
  minimized: false,
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
  home: DEFAULT_HOME,
  petEyesFollow: true,
  alertRetention: "24h",
  sessionRetention: "15m",
  mirrorNotifications: true,
  hidePetFromCapture: true,
  hideIslandFromCapture: false,
  onboarded: false,
  set: (patch) => set(patch),
}));

export const hydrateSettings = () =>
  persist(useSettings, {
    key: "settings",
    version: 3,
    migrations: {
      1: (d) => d,
      // v3: automatic slim modes replaced by a manual minimize button.
      2: ({ slimMode: _s, ...d }) => ({ ...d, minimized: false }),
    },
    pick: ({ set: _s, ...rest }) => rest,
    apply: (d) => {
      // Keep module order valid when new modules ship in later versions.
      const known = new Set(DEFAULT_MODULE_ORDER);
      const order = (d.moduleOrder ?? []).filter((m: string) => known.has(m));
      DEFAULT_MODULE_ORDER.forEach((m) => order.includes(m) || order.push(m));
      // Keep Home widgets valid as new ones ship.
      const home: HomeLayout = { ...DEFAULT_HOME, ...(d.home ?? {}) };
      const seen = new Set(home.widgets.map((w) => w.id));
      home.widgets = [...home.widgets.filter((w) => DEFAULT_HOME.widgets.some((x) => x.id === w.id)), ...DEFAULT_HOME.widgets.filter((w) => !seen.has(w.id))];
      return { ...d, moduleOrder: order, home };
    },
  });

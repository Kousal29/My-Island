import { create } from "zustand";

export type IslandMode = "idle" | "peek" | "expanded";

interface IslandState {
  mode: IslandMode;
  hovered: boolean;
  /** Opened via keyboard/tray: don't auto-collapse until the cursor has visited once. */
  sticky: boolean;
  fullscreenHidden: boolean;
  dragging: boolean;
  /** The desktop pet is being dragged over the island ("drop to bring home"). */
  petNear: boolean;
  dragKind: "files" | "link" | "text" | "unknown";
  dragCount: number;
  active: string;
  /** Sub-route a module can read (e.g. stash filter "clips"). */
  route: string | null;
  /** Bumped on every expand so modules can react to the same route again (e.g. refocus quick-add). */
  routeNonce: number;
  settingsOpen: boolean;
  settingsSection: string;
  /** Open popovers etc. that must keep the island expanded. */
  holds: number;
  hold: (delta: 1 | -1) => void;
  expand: (module?: string, route?: string | null, sticky?: boolean) => void;
  collapse: () => void;
  setActive: (module: string, route?: string | null) => void;
  set: (patch: Partial<IslandState>) => void;
}

export const useIsland = create<IslandState>((set, get) => ({
  mode: "idle",
  hovered: false,
  sticky: false,
  fullscreenHidden: false,
  dragging: false,
  petNear: false,
  dragKind: "files",
  dragCount: 0,
  active: "home",
  route: null,
  routeNonce: 0,
  settingsOpen: false,
  settingsSection: "general",
  holds: 0,
  hold: (delta) => set({ holds: Math.max(0, get().holds + delta) }),
  expand: (module, route = null, sticky = false) =>
    set({
      mode: "expanded",
      sticky,
      routeNonce: get().routeNonce + 1,
      ...(module ? { active: module, route, settingsOpen: false } : {}),
    }),
  collapse: () => {
    if (get().mode === "idle") return;
    set({ mode: get().hovered ? "peek" : "idle", sticky: false, settingsOpen: false });
  },
  setActive: (active, route = null) => set({ active, route, settingsOpen: false }),
  set: (patch) => set(patch),
}));

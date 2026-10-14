import { create } from "zustand";
import { persist } from "../lib/persist";
import { uid } from "../lib/util";

/**
 * A workspace is a project context ("Personal", "Thesis", "Client X docs").
 * Stash items, docs, collections, todo lists and tasks all belong to one.
 * `ALL` is a virtual view across every workspace.
 */
export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  createdAt: number;
  lastOpenedAt: number;
}

export const ALL = "all";
export const DEFAULT_WS = "personal";

export const WS_COLORS = ["#8b7bff", "#4fb4ff", "#3fe0b0", "#ffd24a", "#ff9f6e", "#ff6f9c", "#b18cff", "#7dd3fc"];
export const WS_EMOJI = ["🏠", "💼", "📚", "🚀", "🎨", "🧪", "💡", "🎓", "🛠️", "📈", "🎮", "✈️", "🧠", "📝", "🌱", "⭐"];

interface WorkspaceState {
  workspaces: Workspace[];
  current: string;
  create: (name: string, emoji?: string, color?: string, description?: string) => Workspace;
  update: (id: string, patch: Partial<Omit<Workspace, "id">>) => void;
  remove: (id: string) => void;
  reorder: (ids: string[]) => void;
  setCurrent: (id: string) => void;
}

const now = Date.now();

export const useWorkspaces = create<WorkspaceState>((set, get) => ({
  workspaces: [
    { id: DEFAULT_WS, name: "Personal", emoji: "🏠", color: "#3fe0b0", description: "Life admin, ideas and everything else", createdAt: now, lastOpenedAt: now },
    { id: "work", name: "Work", emoji: "💼", color: "#4fb4ff", description: "Projects, docs and meetings", createdAt: now, lastOpenedAt: now },
  ],
  current: ALL,
  create: (name, emoji, color, description = "") => {
    const ws = get().workspaces;
    const w: Workspace = {
      id: uid(),
      name: name.trim() || "Untitled",
      emoji: emoji ?? WS_EMOJI[ws.length % WS_EMOJI.length],
      color: color ?? WS_COLORS[ws.length % WS_COLORS.length],
      description,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    };
    set({ workspaces: [...ws, w], current: w.id });
    return w;
  },
  update: (id, patch) => set({ workspaces: get().workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) }),
  remove: (id) => {
    if (id === DEFAULT_WS) return;
    set({ workspaces: get().workspaces.filter((w) => w.id !== id), current: get().current === id ? ALL : get().current });
  },
  reorder: (ids) => {
    const byId = new Map(get().workspaces.map((w) => [w.id, w]));
    set({ workspaces: ids.map((id) => byId.get(id)!).filter(Boolean) });
  },
  setCurrent: (id) =>
    set({
      current: id,
      workspaces: id === ALL ? get().workspaces : get().workspaces.map((w) => (w.id === id ? { ...w, lastOpenedAt: Date.now() } : w)),
    }),
}));

/** Workspace that newly created things should land in. */
export const targetWorkspace = () => {
  const { current, workspaces } = useWorkspaces.getState();
  return current !== ALL && workspaces.some((w) => w.id === current) ? current : DEFAULT_WS;
};

export const inWorkspace = (itemWs: string | null | undefined, current: string) =>
  current === ALL || itemWs === current || itemWs === null;

export const useCurrentWorkspace = () =>
  useWorkspaces((s) => (s.current === ALL ? null : s.workspaces.find((w) => w.id === s.current) ?? null));

export const hydrateWorkspaces = () =>
  persist(useWorkspaces, {
    key: "workspaces",
    version: 1,
    pick: (s) => ({ workspaces: s.workspaces, current: s.current }),
    apply: (d) => d,
  });

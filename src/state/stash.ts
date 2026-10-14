import { create } from "zustand";
import { persist } from "../lib/persist";
import { hashString, hostOf, uid } from "../lib/util";
import { detectClipType, type ClipType } from "../lib/clipType";
import { api, type FileMeta, type LinkMeta } from "../lib/bridge";
import { bus } from "../lib/bus";
import { useSettings } from "./settings";
import { DEFAULT_WS, inWorkspace, targetWorkspace } from "./workspaces";
import { toIcon } from "../ui/icons";

export type StashKind = "file" | "link" | "clip" | "note";

interface Base {
  id: string;
  kind: StashKind;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** null = global (auto-captured clipboard history shows in every workspace). */
  workspaceId: string | null;
  collectionId: string | null;
  tags: string[];
  /** Times re-copied or opened; used for "frequent" ranking. */
  uses: number;
}

export interface FileItem extends Base { kind: "file"; file: Omit<FileMeta, "modified"> }
export interface LinkItem extends Base {
  kind: "link";
  link: { url: string; meta?: LinkMeta; status: "idle" | "loading" | "ok" | "error" };
}
export interface ClipItem extends Base { kind: "clip"; clip: { text: string; type: ClipType; hash: string } }
export interface NoteItem extends Base { kind: "note"; note: { title: string; text: string; color: string; icon?: string } }
export type StashItem = FileItem | LinkItem | ClipItem | NoteItem;

export interface Collection { id: string; name: string; icon: string; color: string; workspaceId: string | null }

export type StashFilter = "all" | "pinned" | StashKind;

interface StashState {
  items: StashItem[];
  collections: Collection[];
  filter: StashFilter;
  collection: string | null;
  addFiles: (paths: string[]) => Promise<number>;
  addLink: (url: string) => LinkItem;
  addClip: (text: string) => ClipItem | null;
  addNote: (text: string, title?: string) => NoteItem;
  moveToWorkspace: (id: string, workspaceId: string | null) => void;
  dropWorkspace: (workspaceId: string, mode: "move" | "delete") => void;
  update: (id: string, patch: Partial<StashItem>) => void;
  remove: (id: string) => StashItem | undefined;
  restore: (item: StashItem) => void;
  togglePin: (id: string) => void;
  moveTo: (id: string, collectionId: string | null) => void;
  touch: (id: string) => void;
  refreshLink: (id: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
  clearClips: (keepPinned?: boolean) => void;
  addCollection: (name: string, icon?: string) => string;
  updateCollection: (id: string, patch: Partial<Collection>) => void;
  removeCollection: (id: string) => void;
  setFilter: (f: StashFilter) => void;
  setCollection: (id: string | null) => void;
}

export const NOTE_COLORS = ["#ffd24a", "#ff9f6e", "#ff6f9c", "#8b7bff", "#4fb4ff", "#3fe0b0"];

const base = (kind: StashKind, collectionId: string | null = null): Base => ({
  id: uid(),
  kind,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  pinned: false,
  workspaceId: kind === "clip" ? null : targetWorkspace(),
  collectionId,
  tags: [],
  uses: 0,
});

export const useStash = create<StashState>((set, get) => ({
  items: [],
  collections: [
    { id: "docs", name: "Docs", icon: "doc", color: "#4fb4ff", workspaceId: "work" },
    { id: "ideas", name: "Ideas", icon: "idea", color: "#ffd24a", workspaceId: DEFAULT_WS },
    { id: "reading", name: "Reading list", icon: "book", color: "#ff6f9c", workspaceId: null },
  ],
  filter: "all",
  collection: null,

  addFiles: async (paths) => {
    const existing = new Set(get().items.filter((i): i is FileItem => i.kind === "file").map((i) => i.file.path.toLowerCase()));
    const fresh = paths.filter((p) => !existing.has(p.toLowerCase()));
    if (!fresh.length) return 0;
    const metas = await api.fileMeta(fresh);
    const list = metas.length ? metas : fresh.map((p) => fallbackMeta(p));
    const coll = get().collection;
    const added: FileItem[] = list.map(({ modified: _m, ...file }) => ({ ...base("file", coll), kind: "file", file }));
    set({ items: [...added, ...get().items] });
    bus.emit("stash:added", { kind: "file" });
    return added.length;
  },

  addLink: (raw) => {
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const dupe = get().items.find((i): i is LinkItem => i.kind === "link" && i.link.url === url);
    if (dupe) {
      get().update(dupe.id, { updatedAt: Date.now() });
      return dupe;
    }
    const item: LinkItem = {
      ...base("link", get().collection),
      kind: "link",
      link: { url, status: "idle", meta: { url, title: hostOf(url) } },
    };
    set({ items: [item, ...get().items] });
    void get().refreshLink(item.id);
    bus.emit("stash:added", { kind: "link" });
    return item;
  },

  addClip: (text) => {
    if (!text.trim()) return null;
    const hash = hashString(text);
    const items = get().items;
    const dupe = items.find((i): i is ClipItem => i.kind === "clip" && i.clip.hash === hash);
    if (dupe) {
      const bumped = { ...dupe, updatedAt: Date.now() };
      set({ items: [bumped, ...items.filter((i) => i.id !== dupe.id)] });
      return bumped;
    }
    const item: ClipItem = { ...base("clip"), kind: "clip", clip: { text, type: detectClipType(text), hash } };
    let next: StashItem[] = [item, ...items];
    // Trim unpinned, unsorted clipboard history beyond the configured limit.
    const limit = useSettings.getState().clipHistoryLimit;
    const history = next.filter((i) => i.kind === "clip" && !i.pinned && !i.collectionId && !i.workspaceId);
    if (history.length > limit) {
      const drop = new Set(history.slice(limit).map((i) => i.id));
      next = next.filter((i) => !drop.has(i.id));
    }
    set({ items: next });
    return item;
  },

  moveToWorkspace: (id, workspaceId) => {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    const coll = get().collections.find((c) => c.id === it.collectionId);
    const keepColl = coll && (coll.workspaceId === null || coll.workspaceId === workspaceId);
    get().update(id, { workspaceId, collectionId: keepColl ? it.collectionId : null });
  },
  dropWorkspace: (ws, mode) =>
    set({
      items:
        mode === "delete"
          ? get().items.filter((i) => i.workspaceId !== ws)
          : get().items.map((i) => (i.workspaceId === ws ? { ...i, workspaceId: DEFAULT_WS, collectionId: null } : i)),
      collections: get().collections.filter((c) => c.workspaceId !== ws),
      collection: get().collections.find((c) => c.id === get().collection)?.workspaceId === ws ? null : get().collection,
    }),
  addNote: (text, title = "") => {
    const item: NoteItem = {
      ...base("note", get().collection),
      kind: "note",
      note: { title, text, color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] },
    };
    set({ items: [item, ...get().items] });
    bus.emit("stash:added", { kind: "note" });
    return item;
  },

  update: (id, patch) =>
    set({ items: get().items.map((i) => (i.id === id ? ({ ...i, ...patch, updatedAt: Date.now() } as StashItem) : i)) }),
  remove: (id) => {
    const it = get().items.find((i) => i.id === id);
    set({ items: get().items.filter((i) => i.id !== id) });
    return it;
  },
  restore: (item) => set({ items: [item, ...get().items.filter((i) => i.id !== item.id)] }),
  togglePin: (id) => {
    const it = get().items.find((i) => i.id === id);
    if (it) get().update(id, { pinned: !it.pinned });
  },
  moveTo: (id, collectionId) => {
    const c = get().collections.find((x) => x.id === collectionId);
    get().update(id, { collectionId, ...(c?.workspaceId ? { workspaceId: c.workspaceId } : {}) });
  },
  touch: (id) => {
    const it = get().items.find((i) => i.id === id);
    if (it) set({ items: get().items.map((i) => (i.id === id ? { ...i, uses: i.uses + 1 } : i)) });
  },

  refreshLink: async (id) => {
    if (!useSettings.getState().linkPreviews) return;
    const it = get().items.find((i): i is LinkItem => i.id === id && i.kind === "link");
    if (!it) return;
    get().update(id, { link: { ...it.link, status: "loading" } } as Partial<LinkItem>);
    try {
      const meta = await api.linkMeta(it.link.url);
      const cur = get().items.find((i): i is LinkItem => i.id === id && i.kind === "link");
      if (cur) get().update(id, { link: { ...cur.link, meta: { ...meta, title: meta.title || hostOf(meta.url) }, status: "ok" } } as Partial<LinkItem>);
    } catch {
      const cur = get().items.find((i): i is LinkItem => i.id === id && i.kind === "link");
      if (cur) get().update(id, { link: { ...cur.link, status: "error" } } as Partial<LinkItem>);
    }
  },

  refreshFiles: async () => {
    const files = get().items.filter((i): i is FileItem => i.kind === "file");
    if (!files.length) return;
    const metas = await api.fileMeta(files.map((f) => f.file.path));
    const byPath = new Map(metas.map((m) => [m.path, m]));
    set({
      items: get().items.map((i) => {
        if (i.kind !== "file") return i;
        const m = byPath.get(i.file.path);
        if (!m) return i;
        const { modified: _m, ...file } = m;
        return { ...i, file };
      }),
    });
  },

  clearClips: (keepPinned = true) =>
    set({ items: get().items.filter((i) => i.kind !== "clip" || (keepPinned && (i.pinned || i.collectionId || i.workspaceId))) }),

  addCollection: (name, icon = "folder") => {
    const id = uid();
    const colors = NOTE_COLORS;
    set({ collections: [...get().collections, { id, name, icon, color: colors[get().collections.length % colors.length], workspaceId: targetWorkspace() }] });
    return id;
  },
  updateCollection: (id, patch) => set({ collections: get().collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
  removeCollection: (id) =>
    set({
      collections: get().collections.filter((c) => c.id !== id),
      items: get().items.map((i) => (i.collectionId === id ? { ...i, collectionId: null } : i)),
      collection: get().collection === id ? null : get().collection,
    }),
  setFilter: (filter) => set({ filter }),
  setCollection: (collection) => set({ collection }),
}));

function fallbackMeta(path: string): FileMeta {
  const name = path.split(/[\\/]/).pop() || path;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return { path, name, ext, isDir: !ext, size: 0, exists: true };
}

export function itemTitle(i: StashItem) {
  switch (i.kind) {
    case "file": return i.file.name;
    case "link": return i.link.meta?.title || hostOf(i.link.url);
    case "clip": return i.clip.text.trim().split("\n")[0].slice(0, 120);
    case "note": return i.note.title || i.note.text.split("\n")[0].slice(0, 80) || "Untitled note";
  }
}

export function itemSearchText(i: StashItem) {
  const extra =
    i.kind === "file" ? i.file.path :
    i.kind === "link" ? `${i.link.url} ${i.link.meta?.description ?? ""} ${i.link.meta?.siteName ?? ""}` :
    i.kind === "clip" ? i.clip.text :
    i.note.text;
  return `${itemTitle(i)} ${extra} ${i.tags.join(" ")}`;
}

/** Items visible in a workspace (clipboard history is global). */
export const stashInWorkspace = (i: StashItem, ws: string) => inWorkspace(i.workspaceId, ws);
export const collectionInWorkspace = (c: Collection, ws: string) => inWorkspace(c.workspaceId, ws);

export const hydrateStash = () =>
  persist(useStash, {
    key: "stash",
    version: 3,
    migrations: {
      1: (d) => ({
        ...d,
        items: (d.items ?? []).map((i: StashItem) => ({ ...i, workspaceId: i.kind === "clip" && !i.pinned && !i.collectionId ? null : DEFAULT_WS })),
        collections: (d.collections ?? []).map((c: Collection) => ({ ...c, workspaceId: DEFAULT_WS })),
      }),
      2: (d) => ({
        ...d,
        collections: (d.collections ?? []).map(({ emoji, ...c }: any) => ({ ...c, icon: toIcon(emoji, "folder") })),
        items: (d.items ?? []).map((i: any) =>
          i.kind === "note" ? { ...i, note: { ...i.note, emoji: undefined, icon: toIcon(i.note?.emoji, "doc") } } : i,
        ),
      }),
    },
    pick: (s) => ({ items: s.items, collections: s.collections, filter: s.filter, collection: s.collection }),
    apply: (d) => d,
  });

import { create } from "zustand";
import { persist } from "../lib/persist";
import { uid } from "../lib/util";
import { bus } from "../lib/bus";
import { parseQuickAdd } from "../lib/quickAdd";
import { ALL, DEFAULT_WS, inWorkspace, targetWorkspace, useWorkspaces } from "./workspaces";

export type Priority = 0 | 1 | 2 | 3;

export interface Subtask { id: string; title: string; done: boolean }

export interface Todo {
  id: string;
  workspaceId: string;
  listId: string;
  title: string;
  notes: string;
  done: boolean;
  doneAt?: number;
  priority: Priority;
  due?: number;
  hasTime?: boolean;
  remindedAt?: number;
  tags: string[];
  subtasks: Subtask[];
  createdAt: number;
  order: number;
}

/** workspaceId null = shared list (Inbox). */
export interface TodoList { id: string; name: string; emoji: string; color: string; workspaceId: string | null }

export type TodoView = "today" | "upcoming" | "all" | "done" | `list:${string}`;
export type TodoSort = "manual" | "due" | "priority";

interface TodoState {
  lists: TodoList[];
  todos: Todo[];
  view: TodoView;
  sort: TodoSort;
  showDone: boolean;
  quickAdd: (input: string, listId?: string) => Todo | null;
  update: (id: string, patch: Partial<Todo>) => void;
  toggle: (id: string) => void;
  remove: (id: string) => Todo | undefined;
  restore: (todo: Todo) => void;
  reorder: (ids: string[]) => void;
  addSubtask: (id: string, title: string) => void;
  toggleSubtask: (id: string, subId: string) => void;
  removeSubtask: (id: string, subId: string) => void;
  clearDone: () => void;
  addList: (name: string, emoji?: string, color?: string) => string;
  updateList: (id: string, patch: Partial<TodoList>) => void;
  removeList: (id: string) => void;
  dropWorkspace: (workspaceId: string, mode: "move" | "delete") => void;
  setView: (v: TodoView) => void;
  setSort: (s: TodoSort) => void;
  setShowDone: (v: boolean) => void;
}

export const LIST_COLORS = ["#8b7bff", "#4fb4ff", "#3fe0b0", "#ffd24a", "#ff9f6e", "#ff6f9c"];
const INBOX = "inbox";

export const useTodos = create<TodoState>((set, get) => ({
  lists: [
    { id: INBOX, name: "Inbox", emoji: "📥", color: "#8b7bff", workspaceId: null },
    { id: "errands", name: "Errands", emoji: "🛒", color: "#3fe0b0", workspaceId: DEFAULT_WS },
    { id: "sprint", name: "This sprint", emoji: "🏃", color: "#4fb4ff", workspaceId: "work" },
  ],
  todos: [],
  view: "today",
  sort: "manual",
  showDone: true,

  quickAdd: (input, listId) => {
    const p = parseQuickAdd(input);
    if (!p.title) return null;
    const { lists, todos, view } = get();
    const byName = p.list && lists.find((l) => l.name.toLowerCase().startsWith(p.list!.toLowerCase()));
    const fromView = view.startsWith("list:") ? view.slice(5) : undefined;
    const due = p.due ?? (view === "today" ? startOfToday() : undefined);
    const chosenList = lists.find((l) => l.id === ((byName && byName.id) || listId || fromView));
    const todo: Todo = {
      id: uid(),
      workspaceId: chosenList?.workspaceId ?? targetWorkspace(),
      listId: chosenList?.id ?? INBOX,
      title: p.title,
      notes: "",
      done: false,
      priority: p.priority ?? 0,
      due,
      hasTime: p.due ? p.hasTime : false,
      tags: p.tags,
      subtasks: [],
      createdAt: Date.now(),
      order: Math.min(0, ...todos.map((t) => t.order)) - 1,
    };
    set({ todos: [todo, ...todos] });
    bus.emit("todo:added", { id: todo.id });
    return todo;
  },
  update: (id, patch) => set({ todos: get().todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  toggle: (id) => {
    const t = get().todos.find((x) => x.id === id);
    if (!t) return;
    const done = !t.done;
    get().update(id, { done, doneAt: done ? Date.now() : undefined });
    if (done) bus.emit("todo:completed", { id, title: t.title });
  },
  remove: (id) => {
    const t = get().todos.find((x) => x.id === id);
    set({ todos: get().todos.filter((x) => x.id !== id) });
    return t;
  },
  restore: (todo) => set({ todos: [...get().todos, todo] }),
  reorder: (ids) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    const base = Math.min(...get().todos.map((t) => t.order));
    set({ todos: get().todos.map((t) => (pos.has(t.id) ? { ...t, order: base + pos.get(t.id)! } : t)) });
  },
  addSubtask: (id, title) => {
    const t = get().todos.find((x) => x.id === id);
    if (t && title.trim()) get().update(id, { subtasks: [...t.subtasks, { id: uid(), title: title.trim(), done: false }] });
  },
  toggleSubtask: (id, subId) => {
    const t = get().todos.find((x) => x.id === id);
    if (!t) return;
    const subtasks = t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s));
    get().update(id, { subtasks });
    if (subtasks.length && subtasks.every((s) => s.done) && !t.done) get().toggle(id);
  },
  removeSubtask: (id, subId) => {
    const t = get().todos.find((x) => x.id === id);
    if (t) get().update(id, { subtasks: t.subtasks.filter((s) => s.id !== subId) });
  },
  clearDone: () => set({ todos: get().todos.filter((t) => !t.done) }),
  addList: (name, emoji = "📝", color) => {
    const id = uid();
    const lists = get().lists;
    set({ lists: [...lists, { id, name, emoji, color: color ?? LIST_COLORS[lists.length % LIST_COLORS.length], workspaceId: targetWorkspace() }] });
    return id;
  },
  updateList: (id, patch) => set({ lists: get().lists.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
  removeList: (id) => {
    if (id === INBOX) return;
    set({
      lists: get().lists.filter((l) => l.id !== id),
      todos: get().todos.map((t) => (t.listId === id ? { ...t, listId: INBOX } : t)),
      view: get().view === `list:${id}` ? "all" : get().view,
    });
  },
  dropWorkspace: (ws, mode) => {
    const dead = new Set(get().lists.filter((l) => l.workspaceId === ws).map((l) => l.id));
    set({
      lists: get().lists.filter((l) => !dead.has(l.id)),
      todos:
        mode === "delete"
          ? get().todos.filter((t) => t.workspaceId !== ws)
          : get().todos.map((t) => (t.workspaceId === ws ? { ...t, workspaceId: DEFAULT_WS, listId: dead.has(t.listId) ? INBOX : t.listId } : t)),
      view: get().view.startsWith("list:") && dead.has(get().view.slice(5)) ? "today" : get().view,
    });
  },
  setView: (view) => set({ view }),
  setSort: (sort) => set({ sort }),
  setShowDone: (showDone) => set({ showDone }),
}));

const startOfToday = () => dayStart(Date.now());

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function selectVisible(s: Pick<TodoState, "todos" | "view" | "sort" | "showDone">, query = "", ws = useWorkspaces.getState().current) {
  const today = dayStart(Date.now());
  let list = s.todos.filter((t) => {
    if (ws !== ALL && t.workspaceId !== ws) return false;
    switch (s.view) {
      case "today":
        return t.due !== undefined && dayStart(t.due) <= today && (!t.done || (t.doneAt ?? 0) >= today);
      case "upcoming":
        return t.due !== undefined && dayStart(t.due) > today;
      case "done":
        return t.done;
      case "all":
        return true;
      default:
        return t.listId === s.view.slice(5);
    }
  });
  if (!s.showDone && s.view !== "done") list = list.filter((t) => !t.done);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.tags.some((g) => g.includes(q)));
  }
  const cmp: Record<TodoSort, (a: Todo, b: Todo) => number> = {
    manual: (a, b) => a.order - b.order,
    due: (a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || b.priority - a.priority,
    priority: (a, b) => b.priority - a.priority || (a.due ?? Infinity) - (b.due ?? Infinity),
  };
  return list.sort((a, b) => Number(a.done) - Number(b.done) || cmp[s.sort](a, b));
}

export function todayProgress(todos: Todo[], ws = useWorkspaces.getState().current) {
  const today = dayStart(Date.now());
  const relevant = todos.filter((t) => (ws === ALL || t.workspaceId === ws) && t.due !== undefined && dayStart(t.due) <= today && (!t.done || (t.doneAt ?? 0) >= today));
  return { done: relevant.filter((t) => t.done).length, total: relevant.length };
}

export const listInWorkspace = (l: TodoList, ws: string) => inWorkspace(l.workspaceId, ws);

export const hydrateTodos = () =>
  persist(useTodos, {
    key: "todos",
    version: 2,
    migrations: {
      1: (d) => ({
        ...d,
        todos: (d.todos ?? []).map((t: Todo) => ({ ...t, workspaceId: DEFAULT_WS })),
        lists: (d.lists ?? []).map((l: TodoList) => ({ ...l, workspaceId: l.id === INBOX ? null : DEFAULT_WS })),
      }),
    },
    pick: (s) => ({ lists: s.lists, todos: s.todos, view: s.view, sort: s.sort, showDone: s.showDone }),
    apply: (d) => d,
  });

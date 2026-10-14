import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import {
  ArrowUpDown, CalendarClock, CalendarDays, Check, Flag, GripVertical, Hash, Inbox, ListChecks, MoreHorizontal,
  Plus, Search, Sparkles, Sun, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeDue, parseQuickAdd } from "../../lib/quickAdd";
import { play } from "../../lib/sound";
import { cx } from "../../lib/util";
import { useIsland } from "../../state/island";
import { toast } from "../../state/toast";
import { LIST_COLORS, listInWorkspace, selectVisible, todayProgress, useTodos, type Priority, type Todo, type TodoView } from "../../state/todos";
import { ALL, useCurrentWorkspace, useWorkspaces } from "../../state/workspaces";
import { WorkspaceDot } from "../../ui/workspaces";
import { Chip, Empty, IconButton, Menu, Ring, Segmented, spring } from "../../ui/primitives";
import type { IslandModule } from "../types";
import { Checkbox } from "./Checkbox";

export const PRIORITY: Record<Priority, { label: string; color: string }> = {
  0: { label: "None", color: "rgb(255 255 255 / 0.3)" },
  1: { label: "Low", color: "#4fb4ff" },
  2: { label: "Medium", color: "#ffc94a" },
  3: { label: "High", color: "#ff6b7d" },
};

function QuickAdd() {
  const [text, setText] = useState("");
  const quickAdd = useTodos((s) => s.quickAdd);
  const allLists = useTodos((s) => s.lists);
  const ws = useWorkspaces((s) => s.current);
  const curWs = useCurrentWorkspace();
  const lists = allLists.filter((l) => listInWorkspace(l, ws));
  const route = useIsland((s) => s.route);
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);
  const list = parsed?.list && lists.find((l) => l.name.toLowerCase().startsWith(parsed.list!.toLowerCase()));

  useEffect(() => {
    if (route === "new") ref.current?.focus();
  }, [route]);

  const submit = () => {
    const t = quickAdd(text);
    if (t) {
      play("pop");
      setText("");
    }
  };

  return (
    <div className="relative">
      <div className="flex h-10 items-center gap-2 rounded-2xl bg-white/6 pr-1.5 pl-3 ring-1 ring-white/6 transition focus-within:bg-white/8 focus-within:ring-[var(--accent)]/50">
        <Plus size={16} className="text-ink-3" />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape" && text) {
              e.stopPropagation();
              setText("");
            }
          }}
          placeholder={curWs ? `Add a task to ${curWs.name}…  try “Ship v2 fri !high #launch”` : "Add a task…  try “Call mom tomorrow 6pm !high #family”"}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4"
        />
        <AnimatePresence>
          {text.trim() && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={spring}
              onClick={submit}
              className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent)] text-black"
            >
              <Check size={15} strokeWidth={3} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {parsed && (parsed.due || parsed.priority || parsed.tags.length || list) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 overflow-hidden px-1 pt-1.5"
          >
            {parsed.due && (
              <Tag icon={<CalendarClock size={11} />} color="var(--accent)">
                {describeDue(parsed.due, parsed.hasTime).label}
              </Tag>
            )}
            {!!parsed.priority && (
              <Tag icon={<Flag size={11} />} color={PRIORITY[parsed.priority].color}>
                {PRIORITY[parsed.priority].label}
              </Tag>
            )}
            {list && <Tag color={list.color}>{list.emoji} {list.name}</Tag>}
            {parsed.tags.map((t) => (
              <Tag key={t} icon={<Hash size={10} />}>{t}</Tag>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tag({ children, icon, color = "rgb(255 255 255 / 0.5)" }: { children: React.ReactNode; icon?: React.ReactNode; color?: string }) {
  return (
    <motion.span
      layout
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold"
      style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}
    >
      {icon}
      {children}
    </motion.span>
  );
}

function TodoEditor({ todo }: { todo: Todo }) {
  const { update, addSubtask, toggleSubtask, removeSubtask, lists } = useTodos();
  const workspaces = useWorkspaces((s) => s.workspaces);
  const [sub, setSub] = useState("");
  const setDue = (days: number | null) => {
    if (days === null) return update(todo.id, { due: undefined, hasTime: false });
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    update(todo.id, { due: d.getTime(), hasTime: false, remindedAt: undefined });
  };
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-2.5 pt-2 pr-1 pb-1 pl-8">
        <textarea
          value={todo.notes}
          onChange={(e) => update(todo.id, { notes: e.target.value })}
          placeholder="Notes…"
          rows={2}
          className="w-full resize-none rounded-xl bg-white/5 px-2.5 py-2 text-[12px] text-ink-2 outline-none placeholder:text-ink-4 focus:bg-white/8"
        />
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {todo.subtasks.map((s) => (
              <motion.div key={s.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-2">
                <Checkbox size={15} checked={s.done} onChange={() => toggleSubtask(todo.id, s.id)} />
                <span className={cx("flex-1 text-[12px]", s.done ? "text-ink-3 line-through" : "text-ink-2")}>{s.title}</span>
                <button onClick={() => removeSubtask(todo.id, s.id)} className="text-ink-4 opacity-0 transition group-hover:opacity-100 hover:text-bad">
                  <X size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="flex items-center gap-2">
            <Plus size={13} className="ml-0.5 text-ink-4" />
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sub.trim()) {
                  addSubtask(todo.id, sub);
                  setSub("");
                }
              }}
              placeholder="Add subtask"
              className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-ink-4"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            id={`prio-${todo.id}`}
            value={String(todo.priority) as "0" | "1" | "2" | "3"}
            onChange={(v) => update(todo.id, { priority: Number(v) as Priority })}
            options={([0, 1, 2, 3] as Priority[]).map((p) => ({
              value: String(p) as "0" | "1" | "2" | "3",
              label: p === 0 ? "—" : <Flag size={11} style={{ color: PRIORITY[p].color }} fill={PRIORITY[p].color} />,
            }))}
          />
          <div className="flex gap-1">
            {[
              ["Today", 0],
              ["Tmrw", 1],
              ["+1w", 7],
            ].map(([l, d]) => (
              <button key={l} onClick={() => setDue(d as number)} className="h-6 rounded-full bg-white/6 px-2 text-[11px] text-ink-2 hover:bg-white/12">
                {l}
              </button>
            ))}
            {todo.due !== undefined && (
              <button onClick={() => setDue(null)} className="h-6 rounded-full px-2 text-[11px] text-ink-3 hover:text-bad">
                Clear date
              </button>
            )}
          </div>
          <select
            value={todo.workspaceId}
            onChange={(e) => {
              const wsId = e.target.value;
              const list = lists.find((l) => l.id === todo.listId);
              update(todo.id, { workspaceId: wsId, listId: list && list.workspaceId && list.workspaceId !== wsId ? "inbox" : todo.listId });
            }}
            className="ml-auto h-6 rounded-full bg-white/6 px-2 text-[11px] text-ink-2 outline-none"
            title="Workspace"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id} className="bg-panel-2">
                {w.emoji} {w.name}
              </option>
            ))}
          </select>
          <select
            value={todo.listId}
            onChange={(e) => update(todo.id, { listId: e.target.value })}
            className="h-6 rounded-full bg-white/6 px-2 text-[11px] text-ink-2 outline-none"
            title="List"
          >
            {lists.filter((l) => listInWorkspace(l, todo.workspaceId)).map((l) => (
              <option key={l.id} value={l.id} className="bg-panel-2">
                {l.emoji} {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </motion.div>
  );
}

function TodoRow({ todo, open, onOpen, draggable }: { todo: Todo; open: boolean; onOpen: () => void; draggable: boolean }) {
  const { toggle, remove, restore } = useTodos();
  const list = useTodos((s) => s.lists.find((l) => l.id === todo.listId));
  const drag = useDragControls();
  const showWs = useWorkspaces((s) => s.current === ALL);
  const ws = useWorkspaces((s) => s.workspaces.find((w) => w.id === todo.workspaceId) ?? null);
  const due = todo.due !== undefined ? describeDue(todo.due, todo.hasTime) : null;
  const subDone = todo.subtasks.filter((s) => s.done).length;
  const color = list?.color ?? "var(--accent)";

  const content = (
    <motion.div
      layout="position"
      onClick={onOpen}
      className={cx("clickable group relative rounded-2xl px-2 py-1.5 transition-colors", open ? "bg-white/7" : "hover:bg-white/5")}
    >
      <div className="flex items-start gap-2.5">
        {draggable && (
          <span onPointerDown={(e) => drag.start(e)} className="-ml-1 mt-0.5 cursor-grab touch-none text-ink-4 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing">
            <GripVertical size={14} />
          </span>
        )}
        <div className="mt-[1px]">
          <Checkbox
            checked={todo.done}
            color={color}
            onChange={() => {
              if (!todo.done) play("success");
              toggle(todo.id);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative inline-block max-w-full">
            <span className={cx("block truncate text-[13px] transition-colors duration-300", todo.done ? "text-ink-3" : "text-ink")}>{todo.title}</span>
            <motion.span
              className="absolute top-1/2 left-0 h-[1.5px] rounded-full bg-ink-3"
              initial={false}
              animate={{ width: todo.done ? "100%" : "0%" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          {(due || todo.tags.length > 0 || todo.subtasks.length > 0 || todo.notes || (showWs && ws)) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-3">
              {showWs && ws && (
                <span className="inline-flex items-center gap-1">
                  <WorkspaceDot ws={ws} size={13} />
                  {ws.name}
                </span>
              )}
              {due && (
                <span className={cx("inline-flex items-center gap-1", due.overdue && !todo.done ? "text-bad" : due.dayDiff === 0 ? "text-[var(--accent-ink)]" : "")}>
                  <CalendarDays size={10.5} />
                  {due.label}
                </span>
              )}
              {todo.subtasks.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ListChecks size={10.5} />
                  {subDone}/{todo.subtasks.length}
                </span>
              )}
              {todo.tags.map((t) => (
                <span key={t} className="text-ink-3">#{t}</span>
              ))}
              {list && list.id !== "inbox" && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: list.color }} />
                  {list.name}
                </span>
              )}
            </div>
          )}
        </div>
        {todo.priority > 0 && <Flag size={13} className="mt-1 shrink-0" style={{ color: PRIORITY[todo.priority].color }} fill={PRIORITY[todo.priority].color} />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const t = remove(todo.id);
            if (t) toast(`Deleted “${t.title.slice(0, 28)}”`, { label: "Undo", run: () => restore(t) });
          }}
          className="mt-0.5 shrink-0 text-ink-4 opacity-0 transition group-hover:opacity-100 hover:text-bad"
          aria-label="Delete task"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <AnimatePresence initial={false}>{open && <TodoEditor todo={todo} />}</AnimatePresence>
    </motion.div>
  );

  if (!draggable) return content;
  return (
    <Reorder.Item value={todo.id} dragListener={false} dragControls={drag} className="list-none" whileDrag={{ scale: 1.02, zIndex: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
      {content}
    </Reorder.Item>
  );
}

function ViewBar() {
  const { view, setView, lists: allLists, todos: allTodos, addList, removeList } = useTodos();
  const ws = useWorkspaces((s) => s.current);
  const lists = useMemo(() => allLists.filter((l) => listInWorkspace(l, ws)), [allLists, ws]);
  const todos = useMemo(() => allTodos.filter((t) => ws === ALL || t.workspaceId === ws), [allTodos, ws]);
  useEffect(() => {
    if (view.startsWith("list:") && !lists.some((l) => `list:${l.id}` === view)) setView("today");
  }, [lists, view, setView]);
  const counts = useMemo(() => {
    const open = todos.filter((t) => !t.done);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      today: open.filter((t) => t.due !== undefined && t.due < today.getTime() + 86400000).length,
      upcoming: open.filter((t) => t.due !== undefined && t.due >= today.getTime() + 86400000).length,
      all: open.length,
      ...Object.fromEntries(lists.map((l) => [`list:${l.id}`, open.filter((t) => t.listId === l.id).length])),
    } as Record<string, number>;
  }, [todos, lists]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const views: { v: TodoView; label: React.ReactNode }[] = [
    { v: "today", label: <><Sun size={12} />Today</> },
    { v: "upcoming", label: <><CalendarDays size={12} />Upcoming</> },
    { v: "all", label: <><Inbox size={12} />All</> },
    ...lists.map((l) => ({ v: `list:${l.id}` as TodoView, label: <>{l.emoji} {l.name}</> })),
  ];

  return (
    <div className="scroll flex items-center gap-0.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {views.map(({ v, label }) => (
        <Chip key={v} active={view === v} onClick={() => setView(v)} layoutGroup="todo-view">
          {label}
          {counts[v] > 0 && <span className="tabular text-[10px] text-ink-3">{counts[v]}</span>}
        </Chip>
      ))}
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setAdding(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              const id = addList(name.trim(), "📝", LIST_COLORS[lists.length % LIST_COLORS.length]);
              setView(`list:${id}`);
              setName("");
              setAdding(false);
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setAdding(false);
            }
          }}
          placeholder="List name"
          className="h-7 w-24 shrink-0 rounded-full bg-white/8 px-2.5 text-[12px] outline-none"
        />
      ) : (
        <IconButton label="New list" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} />
        </IconButton>
      )}
      {view.startsWith("list:") && view !== "list:inbox" && (
        <IconButton
          label="Delete list"
          size="sm"
          tone="danger"
          onClick={() => {
            const id = view.slice(5);
            const l = lists.find((x) => x.id === id);
            removeList(id);
            if (l) toast(`Deleted list ${l.name} — tasks moved to Inbox`);
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      )}
    </div>
  );
}

function TodosView() {
  const state = useTodos();
  const ws = useWorkspaces((s) => s.current);
  const curWs = useCurrentWorkspace();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = useMemo(() => selectVisible(state, query, ws), [state.todos, state.view, state.sort, state.showDone, query, ws]);
  const progress = todayProgress(state.todos, ws);
  const doneCount = state.todos.filter((t) => t.done).length;
  const draggable = state.sort === "manual" && !query;

  const empty = {
    today: { icon: "☀️", title: "Nothing due today", hint: "Add a task above — it'll be due today. Enjoy the calm!" },
    upcoming: { icon: "🗓️", title: "No upcoming tasks", hint: "Add dates like “fri”, “next week” or “10/24”." },
    all: { icon: curWs?.emoji ?? "✨", title: curWs ? `No tasks in ${curWs.name}` : "All clear", hint: "Your task list is empty. Add one above." },
    done: { icon: "🏁", title: "Nothing completed yet", hint: "" },
  } as Record<string, { icon: string; title: string; hint: string }>;
  const e = empty[state.view] ?? { icon: "📝", title: "This list is empty", hint: "Tasks you add here land in this list." };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ViewBar />
        </div>
        <AnimatePresence initial={false}>
          {searching && (
            <motion.input
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 120, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              autoFocus
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  ev.stopPropagation();
                  setQuery("");
                  setSearching(false);
                }
              }}
              placeholder="Search"
              className="h-7 rounded-full bg-white/8 px-2.5 text-[12px] outline-none"
            />
          )}
        </AnimatePresence>
        <IconButton label="Search tasks" size="sm" active={searching} onClick={() => (setSearching(!searching), setQuery(""))}>
          <Search size={14} />
        </IconButton>
        <Menu
          trigger={(open) => (
            <IconButton label="Sort & options" size="sm" onClick={open}>
              <MoreHorizontal size={15} />
            </IconButton>
          )}
          items={[
            { label: `Sort: manual${state.sort === "manual" ? " ✓" : ""}`, icon: <GripVertical size={13} />, onSelect: () => state.setSort("manual") },
            { label: `Sort: due date${state.sort === "due" ? " ✓" : ""}`, icon: <CalendarDays size={13} />, onSelect: () => state.setSort("due") },
            { label: `Sort: priority${state.sort === "priority" ? " ✓" : ""}`, icon: <ArrowUpDown size={13} />, onSelect: () => state.setSort("priority") },
            "sep",
            { label: state.showDone ? "Hide completed" : "Show completed", icon: <Check size={13} />, onSelect: () => state.setShowDone(!state.showDone) },
            { label: "Completed tasks", icon: <ListChecks size={13} />, onSelect: () => state.setView("done") },
            doneCount > 0 && {
              label: `Clear ${doneCount} completed`,
              icon: <Trash2 size={13} />,
              danger: true,
              onSelect: () => {
                const removed = state.todos.filter((t) => t.done);
                state.clearDone();
                toast(`Cleared ${removed.length} tasks`, { label: "Undo", run: () => removed.forEach(state.restore) });
              },
            },
          ]}
        />
        {progress.total > 0 && (
          <Ring value={progress.done / progress.total} size={26} stroke={3.5}>
            <span className="tabular text-[8.5px] font-bold text-ink-2">{progress.done}</span>
          </Ring>
        )}
      </div>

      <QuickAdd />

      <div className="scroll fade-y -mx-1 min-h-0 flex-1 px-1 py-1">
        {visible.length === 0 ? (
          <Empty icon={e.icon} title={query ? "No matches" : e.title} hint={query ? `Nothing matches “${query}”.` : e.hint} />
        ) : draggable ? (
          <Reorder.Group axis="y" values={visible.map((t) => t.id)} onReorder={state.reorder} className="space-y-0.5">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <TodoRow key={t.id} todo={t} open={openId === t.id} onOpen={() => setOpenId(openId === t.id ? null : t.id)} draggable />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring}>
                  <TodoRow todo={t} open={openId === t.id} onOpen={() => setOpenId(openId === t.id ? null : t.id)} draggable={false} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function useTodoActivity() {
  const todos = useTodos((s) => s.todos);
  const now = Date.now();
  const soon = todos
    .filter((t) => !t.done && t.hasTime && t.due !== undefined && t.due - now < 15 * 60000 && t.due - now > -60 * 60000)
    .sort((a, b) => a.due! - b.due!)[0];
  if (!soon) return null;
  const overdue = soon.due! < now;
  return {
    priority: 45,
    width: 280,
    opens: "todos",
    left: (
      <motion.span animate={{ rotate: [0, -12, 12, -8, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2.4 }} className={overdue ? "text-bad" : "text-warn"}>
        <CalendarClock size={16} />
      </motion.span>
    ),
    center: <span className="max-w-[170px] truncate text-[12px] font-medium text-ink-2">{soon.title}</span>,
    right: <span className={cx("tabular text-[11px] font-semibold", overdue ? "text-bad" : "text-warn")}>{overdue ? "now" : `${Math.max(1, Math.round((soon.due! - now) / 60000))}m`}</span>,
  };
}

export const todosModule: IslandModule = {
  id: "todos",
  title: "To-do",
  icon: Sparkles,
  size: { w: 600, h: 420 },
  View: TodosView,
  useActivity: useTodoActivity,
  description: "Lists, priorities, due dates, subtasks and natural-language quick add.",
};

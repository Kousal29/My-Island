import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Folders, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { play } from "../lib/sound";
import { cx } from "../lib/util";
import { useIsland } from "../state/island";
import { useStash } from "../state/stash";
import { useTodos } from "../state/todos";
import { ALL, WS_COLORS, useWorkspaces, type Workspace } from "../state/workspaces";
import { Glyph, IconPicker, PICKER_ICONS } from "./icons";
import { Popover, bouncy, spring } from "./primitives";

export function ColorDots({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {WS_COLORS.map((c) => (
        <motion.button
          key={c}
          type="button"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.85 }}
          transition={bouncy}
          onClick={() => onPick(c)}
          className="relative grid h-5 w-5 place-items-center rounded-full"
          style={{ background: c }}
          aria-label={`Color ${c}`}
        >
          <AnimatePresence>
            {value === c && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={bouncy}>
                <Check size={11} strokeWidth={3.5} className="text-black/75" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      ))}
    </div>
  );
}

/** Create/edit form used by the switcher and settings. */
export function WorkspaceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Workspace>;
  submitLabel: string;
  onSubmit: (w: { name: string; icon: string; color: string; description: string }) => void;
  onCancel?: () => void;
}) {
  const count = useWorkspaces((s) => s.workspaces.length);
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<string>(initial?.icon ?? PICKER_ICONS[(count + 3) % PICKER_ICONS.length]);
  const [color, setColor] = useState(initial?.color ?? WS_COLORS[count % WS_COLORS.length]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const submit = () => name.trim() && onSubmit({ name: name.trim(), icon, color, description: description.trim() });
  return (
    <div className="space-y-2.5 p-1.5">
      <div className="flex items-center gap-2">
        <motion.div key={icon + color} initial={{ scale: 0.6, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={bouncy}>
          <Glyph name={icon} color={color} size={40} />
        </motion.div>
        <div className="min-w-0 flex-1 space-y-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape" && onCancel) (e.stopPropagation(), onCancel());
            }}
            maxLength={32}
            placeholder="Folder name, e.g. “Thesis”"
            className="h-7 w-full rounded-lg bg-white/7 px-2 text-[13px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-4 focus:bg-white/10"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={80}
            placeholder="What's it for? (optional)"
            className="h-6 w-full rounded-lg bg-transparent px-2 text-[11.5px] text-ink-2 outline-none placeholder:text-ink-4 focus:bg-white/6"
          />
        </div>
      </div>
      <IconPicker value={icon} onPick={setIcon} color={color} />
      <ColorDots value={color} onPick={setColor} />
      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        {onCancel && (
          <button onClick={onCancel} className="h-7 rounded-full px-3 text-[12px] text-ink-3 hover:bg-white/6 hover:text-ink-2">
            Cancel
          </button>
        )}
        <motion.button
          whileTap={name.trim() ? { scale: 0.94 } : undefined}
          disabled={!name.trim()}
          onClick={submit}
          className={cx(
            "h-7 rounded-full px-3.5 text-[12px] font-semibold transition-colors",
            name.trim() ? "text-black" : "cursor-not-allowed bg-white/8 text-ink-4",
          )}
          style={name.trim() ? { background: color } : undefined}
        >
          {submitLabel}
        </motion.button>
      </div>
    </div>
  );
}

function useCounts() {
  const items = useStash((s) => s.items);
  const todos = useTodos((s) => s.todos);
  const counts = new Map<string, { items: number; todos: number }>();
  const bump = (ws: string | null, key: "items" | "todos") => {
    if (!ws) return;
    const c = counts.get(ws) ?? { items: 0, todos: 0 };
    c[key]++;
    counts.set(ws, c);
  };
  items.forEach((i) => bump(i.workspaceId, "items"));
  todos.forEach((t) => !t.done && bump(t.workspaceId, "todos"));
  return counts;
}

export function WorkspaceDot({ ws, size = 18 }: { ws: Workspace | null; size?: number }) {
  if (ws) return <Glyph name={ws.icon} color={ws.color} size={size} />;
  return (
    <span className="grid shrink-0 place-items-center bg-white/8 text-ink-2" style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}>
      <Folders size={Math.round(size * 0.56)} strokeWidth={2.1} />
    </span>
  );
}

export function WorkspaceSwitcher() {
  const { workspaces, current, setCurrent, create } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  const counts = useCounts();
  const cur = workspaces.find((w) => w.id === current) ?? null;

  const pick = (id: string, close: () => void) => {
    setCurrent(id);
    play("tick");
    close();
  };

  return (
    <Popover
      align="left"
      width={280}
      estHeight={360}
      trigger={(toggle, open) => (
        <motion.button
          onClick={() => {
            setCreating(false);
            toggle();
          }}
          whileTap={{ scale: 0.94 }}
          title="Switch folder (Alt+1…9, Alt+0 for all)"
          className={cx(
            "focus-ring flex h-8 max-w-[150px] items-center gap-1.5 rounded-full pr-2 pl-1 text-[12px] font-semibold outline-none transition-colors",
            open ? "bg-white/12" : "bg-white/6 hover:bg-white/10",
          )}
          style={cur ? { boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${cur.color} 40%, transparent)` } : undefined}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={cur?.id ?? ALL} initial={{ scale: 0.3, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={bouncy}>
              <WorkspaceDot ws={cur} size={22} />
            </motion.span>
          </AnimatePresence>
          <span className="truncate">{cur?.name ?? "All folders"}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring}>
            <ChevronDown size={12} className="text-ink-3" />
          </motion.span>
        </motion.button>
      )}
    >
      {(close) =>
        creating ? (
          <WorkspaceForm
            submitLabel="Create"
            onCancel={() => setCreating(false)}
            onSubmit={(w) => {
              create(w.name, w.icon, w.color, w.description);
              play("success");
              setCreating(false);
              close();
            }}
          />
        ) : (
          <div className="max-h-[340px] overflow-y-auto">
            <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-ink-4 uppercase">Folders</div>
            {[null, ...workspaces].map((w, i) => {
              const id = w?.id ?? ALL;
              const c = w ? counts.get(w.id) : undefined;
              const active = current === id;
              return (
                <motion.button
                  key={id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.025 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => pick(id, close)}
                  className={cx("group relative flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors", active ? "bg-white/9" : "hover:bg-white/6")}
                >
                  <WorkspaceDot ws={w} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{w?.name ?? "All folders"}</span>
                    <span className="block truncate text-[10.5px] text-ink-3">
                      {w ? (w.description || `${c?.items ?? 0} saved · ${c?.todos ?? 0} open tasks`) : "See everything together"}
                    </span>
                  </span>
                  <span className="text-[10px] text-ink-4 opacity-0 transition-opacity group-hover:opacity-100">Alt+{i}</span>
                  {active && (
                    <motion.span layoutId="ws-check" transition={spring} className="grid h-4 w-4 place-items-center rounded-full" style={{ background: w?.color ?? "var(--accent)" }}>
                      <Check size={10} strokeWidth={3.5} className="text-black" />
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
            <div className="my-1 h-px bg-white/8" />
            <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:bg-white/8 hover:text-ink">
              <Plus size={14} /> New folder
            </button>
            <button
              onClick={() => {
                close();
                useIsland.getState().set({ settingsOpen: true, settingsSection: "workspaces" });
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:bg-white/8 hover:text-ink"
            >
              <Settings2 size={14} /> Manage folders
            </button>
          </div>
        )
      }
    </Popover>
  );
}

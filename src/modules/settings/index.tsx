import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { AnimatePresence, motion, Reorder } from "motion/react";
import { Eye, FolderKanban, GripVertical, Info, Keyboard, LayoutGrid, Monitor, Palette, PawPrint, Pencil, Settings2, Shield, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, isTauri, type MonitorInfo } from "../../lib/bridge";
import { cx } from "../../lib/util";
import { ACCENTS, useSettings, type AccentName } from "../../state/settings";
import { useIsland } from "../../state/island";
import { useStash } from "../../state/stash";
import { deleteWorkspace, workspaceStats } from "../../state/workspaceOps";
import { DEFAULT_WS, useWorkspaces } from "../../state/workspaces";
import { WorkspaceDot, WorkspaceForm } from "../../ui/workspaces";
import { toast } from "../../state/toast";
import { Button, IconButton, Kbd, Segmented, Toggle, bouncy, spring } from "../../ui/primitives";
import { PetCustomizer } from "../pet";
import { MODULES } from "../registry";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function General() {
  const s = useSettings();
  const [auto, setAuto] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    if (!isTauri) return;
    void isEnabled().then(setAuto).catch(() => {});
    void api.listMonitors().then(setMonitors);
  }, []);
  return (
    <div className="divide-y divide-white/6">
      <Row label="Launch at startup" hint="Start My Island when you sign in to Windows.">
        <Toggle
          checked={auto}
          onChange={async (v) => {
            try {
              await (v ? enable() : disable());
              setAuto(v);
            } catch {
              toast("Couldn't change startup setting", undefined, "bad");
            }
          }}
        />
      </Row>
      <Row label="Expand on hover" hint="Open the island just by resting the cursor on it.">
        <Toggle checked={s.expandOnHover} onChange={(v) => s.set({ expandOnHover: v })} />
      </Row>
      <Row label="Auto-collapse delay" hint="How long the island stays open after the cursor leaves.">
        <Segmented
          id="collapse"
          value={String(s.collapseDelay)}
          onChange={(v) => s.set({ collapseDelay: +v })}
          options={[
            { value: "250", label: "Fast" },
            { value: "450", label: "Normal" },
            { value: "1200", label: "Relaxed" },
          ]}
        />
      </Row>
      <Row label="Hide during fullscreen" hint="Get out of the way for games, videos and presentations.">
        <Toggle checked={s.autohideFullscreen} onChange={(v) => s.set({ autohideFullscreen: v })} />
      </Row>
      <Row label="Display" hint="Which monitor the island lives on.">
        <select
          value={s.monitor}
          onChange={(e) => s.set({ monitor: +e.target.value })}
          className="h-7 max-w-[180px] rounded-full bg-white/8 px-2.5 text-[12px] text-ink-2 outline-none"
        >
          <option value={-1} className="bg-panel-2">Primary display</option>
          {monitors.map((m) => (
            <option key={m.index} value={m.index} className="bg-panel-2">
              {m.name.replace(/^\\\\\.\\/, "")} · {m.width}×{m.height}{m.primary ? " (primary)" : ""}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Sounds" hint="Soft chimes for timers, completed tasks and your pet.">
        <Toggle checked={s.sounds} onChange={(v) => s.set({ sounds: v })} />
      </Row>
      <Row label="Reduce motion" hint="Tone down animations across the island.">
        <Toggle checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
      </Row>
    </div>
  );
}

function Appearance() {
  const s = useSettings();
  return (
    <div className="divide-y divide-white/6">
      <Row label="Island shape" hint="Notch hugs the top edge; pill floats just below it.">
        <Segmented
          id="shape"
          value={s.islandStyle}
          onChange={(v) => s.set({ islandStyle: v })}
          options={[
            { value: "notch", label: "Notch" },
            { value: "pill", label: "Pill" },
          ]}
        />
      </Row>
      <Row label="Accent color">
        <div className="flex gap-1.5">
          {(Object.keys(ACCENTS) as AccentName[]).map((a) => (
            <motion.button
              key={a}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => s.set({ accent: a })}
              title={a}
              className={cx("h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-panel transition", s.accent === a ? "ring-white" : "ring-transparent")}
              style={{ background: ACCENTS[a] }}
            />
          ))}
        </div>
      </Row>
      <Row label="Match album art" hint="Tint the island with the colors of what's playing.">
        <Toggle checked={s.useArtworkAccent} onChange={(v) => s.set({ useArtworkAccent: v })} />
      </Row>
      <Row label="Clock in collapsed island">
        <Toggle checked={s.showClock} onChange={(v) => s.set({ showClock: v })} />
      </Row>
      <Row label="Pet in collapsed island">
        <Toggle checked={s.showPetInPill} onChange={(v) => s.set({ showPetInPill: v })} />
      </Row>
    </div>
  );
}

function Modules() {
  const { moduleOrder, disabledModules, set } = useSettings();
  return (
    <div>
      <div className="mb-2 text-[11.5px] text-ink-3">Drag to reorder tabs. Disabled modules disappear from the island but keep their data.</div>
      <Reorder.Group axis="y" values={moduleOrder} onReorder={(v) => set({ moduleOrder: v })} className="space-y-1">
        {moduleOrder.map((id) => {
          const m = MODULES[id];
          if (!m) return null;
          const on = !disabledModules.includes(id);
          const Icon = m.icon;
          return (
            <Reorder.Item key={id} value={id} className="flex cursor-grab items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 active:cursor-grabbing" whileDrag={{ scale: 1.03, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
              <GripVertical size={14} className="text-ink-4" />
              <Icon size={15} className={on ? "text-[var(--accent-ink)]" : "text-ink-4"} />
              <div className="min-w-0 flex-1">
                <div className={cx("text-[12.5px] font-medium", !on && "text-ink-3")}>{m.title}</div>
                <div className="truncate text-[10.5px] text-ink-3">{m.description}</div>
              </div>
              {id !== "home" && <Toggle checked={on} onChange={(v) => set({ disabledModules: v ? disabledModules.filter((d) => d !== id) : [...disabledModules, id] })} />}
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </div>
  );
}

function Workspaces() {
  const { workspaces, update, create, reorder, current } = useWorkspaces();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="text-[11.5px] leading-relaxed text-ink-3">
        Workspaces keep a project's docs, files, links, collections, task lists and tasks together. Clipboard history stays shared until you file a clip.
      </div>
      <Reorder.Group axis="y" values={workspaces.map((w) => w.id)} onReorder={reorder} className="space-y-1.5">
        {workspaces.map((w) => {
          const st = workspaceStats(w.id);
          return (
            <Reorder.Item key={w.id} value={w.id} className="rounded-2xl bg-white/5 ring-1 ring-white/5" whileDrag={{ scale: 1.02, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
              <AnimatePresence mode="wait" initial={false}>
                {editing === w.id ? (
                  <motion.div key="edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <WorkspaceForm
                      initial={w}
                      submitLabel="Save"
                      onCancel={() => setEditing(null)}
                      onSubmit={(patch) => {
                        update(w.id, patch);
                        setEditing(null);
                        toast("Workspace updated");
                      }}
                    />
                  </motion.div>
                ) : confirm === w.id ? (
                  <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 p-3">
                    <div className="text-[12.5px]">
                      Delete <b>{w.emoji} {w.name}</b>? It holds {st.items} saved items and {st.openTodos} open tasks.
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const undo = deleteWorkspace(w.id, "move");
                          setConfirm(null);
                          toast(`Deleted ${w.name} — content moved to Personal`, { label: "Undo", run: undo });
                        }}
                      >
                        Move content to Personal
                      </Button>
                      <Button
                        size="sm"
                        tone="danger"
                        onClick={() => {
                          const undo = deleteWorkspace(w.id, "delete");
                          setConfirm(null);
                          toast(`Deleted ${w.name} and its content`, { label: "Undo", run: undo }, "bad");
                        }}
                      >
                        Delete everything
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group flex cursor-grab items-center gap-3 px-3 py-2 active:cursor-grabbing">
                    <GripVertical size={13} className="shrink-0 text-ink-4" />
                    <WorkspaceDot ws={w} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                        {w.name}
                        {current === w.id && <span className="rounded-full bg-white/10 px-1.5 text-[9.5px] font-medium text-ink-2">current</span>}
                      </div>
                      <div className="truncate text-[10.5px] text-ink-3">
                        {st.docs} docs · {st.files} files · {st.links} links · {st.openTodos} open tasks
                      </div>
                    </div>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton label="Edit" size="sm" onClick={() => setEditing(w.id)}>
                        <Pencil size={13} />
                      </IconButton>
                      {w.id !== DEFAULT_WS && (
                        <IconButton label="Delete" size="sm" tone="danger" onClick={() => setConfirm(w.id)}>
                          <Trash2 size={13} />
                        </IconButton>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      <AnimatePresence initial={false} mode="wait">
        {adding ? (
          <motion.div key="form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-white/5 ring-1 ring-white/8">
            <WorkspaceForm
              submitLabel="Create"
              onCancel={() => setAdding(false)}
              onSubmit={(w) => {
                create(w.name, w.emoji, w.color, w.description);
                setAdding(false);
                toast(`Created ${w.emoji} ${w.name}`);
              }}
            />
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={bouncy}
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 py-2.5 text-[12.5px] text-ink-3 hover:border-white/25 hover:text-ink-2"
          >
            <FolderKanban size={14} /> New workspace
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function Privacy() {
  const s = useSettings();
  const clearClips = useStash((x) => x.clearClips);
  return (
    <div className="divide-y divide-white/6">
      <Row label="Capture clipboard history" hint="Text you copy is saved locally. Password managers that flag secrets are skipped.">
        <Toggle checked={s.clipboardCapture} onChange={(v) => s.set({ clipboardCapture: v })} />
      </Row>
      <Row label="History size" hint="Older unpinned clips are trimmed automatically.">
        <Segmented
          id="hist"
          value={String(s.clipHistoryLimit)}
          onChange={(v) => s.set({ clipHistoryLimit: +v })}
          options={["50", "200", "1000"].map((v) => ({ value: v, label: v }))}
        />
      </Row>
      <Row label="Link previews" hint="Fetch titles & icons for saved links. Off means no network requests at all.">
        <Toggle checked={s.linkPreviews} onChange={(v) => s.set({ linkPreviews: v })} />
      </Row>
      <Row label="Clear clipboard history" hint="Pinned clips and clips in collections are kept.">
        <Button size="sm" tone="danger" onClick={() => (clearClips(true), toast("Clipboard history cleared"))}>
          Clear
        </Button>
      </Row>
      <div className="flex items-start gap-2 pt-3 text-[11px] leading-relaxed text-ink-3">
        <Shield size={13} className="mt-0.5 shrink-0 text-good" />
        Everything stays on this PC in your app-data folder. No accounts, no analytics, no tracking.
      </div>
    </div>
  );
}

function Shortcuts() {
  const rows: [string, ReactNode][] = [
    ["Open / close island", <><Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>Space</Kbd></>],
    ["Clipboard history", <><Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>V</Kbd></>],
    ["Quick add task", <><Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>T</Kbd></>],
    ["Play / pause media", <><Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>P</Kbd></>],
    ["Let pet roam / call home", <><Kbd>Ctrl</Kbd> <Kbd>Alt</Kbd> <Kbd>B</Kbd></>],
    ["Pet leaves the island", "Drag it out with the mouse"],
    ["Switch tabs", <><Kbd>1</Kbd> – <Kbd>7</Kbd> or <Kbd>Ctrl</Kbd> <Kbd>Tab</Kbd></>],
    ["Switch workspace", <><Kbd>Alt</Kbd> <Kbd>1</Kbd> – <Kbd>9</Kbd> · <Kbd>Alt</Kbd> <Kbd>0</Kbd> all</>],
    ["New doc", <><Kbd>Ctrl</Kbd> <Kbd>N</Kbd> in Stash</>],
    ["Search stash", <><Kbd>Ctrl</Kbd> <Kbd>F</Kbd></>],
    ["Settings", <><Kbd>Ctrl</Kbd> <Kbd>,</Kbd></>],
    ["Close", <Kbd>Esc</Kbd>],
    ["Volume", "Scroll over the island"],
  ];
  return (
    <div className="divide-y divide-white/6">
      {rows.map(([l, k]) => (
        <div key={l} className="flex items-center justify-between py-2 text-[12.5px]">
          <span className="text-ink-2">{l}</span>
          <span className="flex items-center gap-1 text-[11px] text-ink-3">{k}</span>
        </div>
      ))}
    </div>
  );
}

function About() {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed text-ink-2">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#8b7bff] to-[#3fd0c9] text-[22px]">🏝️</div>
        <div>
          <div className="font-display text-[16px] font-semibold text-ink">My Island</div>
          <div className="text-[11px] text-ink-3">Version 0.1.0 · Tauri 2 + React</div>
        </div>
      </div>
      <p>A Dynamic Island for Windows: music, focus, tasks, a stash for everything you need nearby, and a little friend who cheers you on.</p>
      <p className="text-ink-3">Tip: right-click the tray icon to re-center the island if you change display layouts.</p>
    </div>
  );
}

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2, View: General },
  { id: "workspaces", label: "Workspaces", icon: FolderKanban, View: Workspaces },
  { id: "appearance", label: "Appearance", icon: Palette, View: Appearance },
  { id: "modules", label: "Modules", icon: LayoutGrid, View: Modules },
  { id: "pet", label: "Pet", icon: PawPrint, View: PetCustomizer },
  { id: "privacy", label: "Privacy", icon: Eye, View: Privacy },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, View: Shortcuts },
  { id: "about", label: "About", icon: Info, View: About },
];

export function SettingsView() {
  const section = useIsland((s) => s.settingsSection);
  const setSection = (id: string) => useIsland.getState().set({ settingsSection: id });
  const S = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="flex h-full gap-3">
      <nav className="flex w-[138px] shrink-0 flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cx("relative flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition-colors", section === s.id ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {section === s.id && <motion.span layoutId="settings-nav" transition={spring} className="absolute inset-0 rounded-xl bg-white/9" />}
            <s.icon size={14} className="relative" />
            <span className="relative">{s.label}</span>
          </button>
        ))}
        <div className="mt-auto flex items-center gap-1.5 px-2.5 text-[10.5px] text-ink-4">
          <Monitor size={11} /> Changes save instantly
        </div>
      </nav>
      <div className="scroll fade-y min-w-0 flex-1 pr-1">
        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.16 }} className="py-1">
            <S.View />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export const SETTINGS_SIZE = { w: 640, h: 420 };

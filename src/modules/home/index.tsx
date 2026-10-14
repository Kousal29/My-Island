import { AnimatePresence, motion, Reorder } from "motion/react";
import { Activity, Archive, Bot, GlassWater, GripVertical, PawPrint, Plus, SlidersHorizontal } from "lucide-react";
import { ChevronRight, Home, Music2, Play, Sparkles, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { play } from "../../lib/sound";
import { formatDuration } from "../../lib/util";
import { useIsland } from "../../state/island";
import { useLive } from "../../state/live";
import { usePet } from "../../state/pet";
import { selectVisible, todayProgress, useTodos } from "../../state/todos";
import { timerActive, timerRemaining, useTimer } from "../../state/timer";
import { Pet } from "../../pet/Pet";
import { Button, Ring, Toggle, softSpring } from "../../ui/primitives";
import { DEFAULT_HOME, useSettings, type HomeLayout, type HomeWidgetId } from "../../state/settings";
import { glassesToday, logWater, useWellness } from "../../state/wellness";
import { useAgents } from "../../state/agents";
import { AgentSpinner, sourceColor } from "../alerts/sessions";
import { Artwork, Transport, appName } from "../media";
import { BatteryGlyph } from "../stats";
import { Checkbox } from "../todos/Checkbox";
import { useNow } from "../timer";
import { itemTitle, useStash } from "../../state/stash";
import { useCurrentWorkspace } from "../../state/workspaces";
import { WorkspaceDot } from "../../ui/workspaces";
import type { IslandModule } from "../types";

function greeting(h: number) {
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const name = usePet((s) => s.name);
  const home = useSettings((s) => s.home);
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !home.clock24 });
  const [hm, ampm] = time.split(" ");
  return (
    <div>
      {home.greeting && (
        <div className="text-[11.5px] font-medium text-ink-3">
          {greeting(now.getHours())} · <span className="text-ink-2">{name}</span> says hi
        </div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="tabular font-display text-[44px] leading-[1.05] font-semibold tracking-tight">{hm}</span>
        {ampm && <span className="text-[14px] font-medium text-ink-3">{ampm}</span>}
      </div>
      {home.showDate && <div className="text-[12.5px] text-ink-2">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>}
      <WorkspaceGlance />
    </div>
  );
}

function WorkspaceGlance() {
  const ws = useCurrentWorkspace();
  const docs = useStash((s) => s.items.filter((i) => i.kind === "note" && (!ws || i.workspaceId === ws.id)).length);
  if (!ws) return null;
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        useStash.getState().setFilter("note");
        useIsland.getState().setActive("stash");
      }}
      className="mt-2 flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-[11px] text-ink-2 hover:bg-white/6"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ws.color} 35%, transparent)` }}
    >
      <WorkspaceDot ws={ws} size={18} />
      <span className="font-semibold text-ink">{ws.name}</span>
      <span className="text-ink-3">· {docs} docs</span>
      <ChevronRight size={11} className="text-ink-4" />
    </motion.button>
  );
}

function Card({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={onClick ? { y: -2 } : undefined}
      transition={softSpring}
      onClick={onClick}
      className={`group relative rounded-2xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.075] ${onClick ? "clickable active:scale-[0.985]" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
      {icon}
      {children}
      <ChevronRight size={11} className="ml-auto opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

function MediaCard() {
  const m = useLive((s) => s.media);
  const open = useIsland((s) => s.setActive);
  return (
    <Card onClick={() => open("media")}>
      <CardTitle icon={<Music2 size={11} />}>{m ? appName(m.appId) : "Now playing"}</CardTitle>
      {m ? (
        <div className="flex items-center gap-2.5">
          <Artwork src={m.artwork} size={40} radius={10} playing={m.playing} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold">{m.title}</div>
            <div className="truncate text-[11px] text-ink-3">{m.artist}</div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Transport m={m} size="sm" />
          </div>
        </div>
      ) : (
        <div className="text-[11.5px] text-ink-3">Nothing playing right now</div>
      )}
    </Card>
  );
}

function TasksCard() {
  const todos = useTodos((s) => s.todos);
  const toggle = useTodos((s) => s.toggle);
  const open = useIsland((s) => s.setActive);
  const p = todayProgress(todos);
  const next = selectVisible({ todos, view: "today", sort: "priority", showDone: false }).slice(0, 3);
  return (
    <Card onClick={() => open("todos")} className="flex-1">
      <CardTitle icon={<Sparkles size={11} />}>
        Today {p.total > 0 && <span className="tabular font-normal normal-case">· {p.done}/{p.total}</span>}
      </CardTitle>
      {next.length ? (
        <div className="space-y-1.5">
          {next.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <Checkbox
                size={15}
                checked={t.done}
                onChange={() => {
                  play("success");
                  toggle(t.id);
                }}
              />
              <span className="truncate text-[12px] text-ink-2">{t.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-ink-3">{p.total ? "All done for today" : "No tasks due today"}</div>
      )}
    </Card>
  );
}

/**
 * Small widgets share one row as equal tiles: a label on top, the value below.
 * Each tile is a size container, so a tile that ends up wide shows a little more.
 */
function Tile({ icon, label, onClick, children }: { icon: React.ReactNode; label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Card onClick={onClick} className="@container flex min-w-0 flex-col justify-between gap-1.5 !px-2.5 !py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-h-[24px] items-center gap-1.5">{children}</div>
    </Card>
  );
}

function FocusChip() {
  const t = useTimer();
  const active = timerActive(t);
  const now = useNow(active && t.running, 500);
  const open = useIsland((s) => s.setActive);
  return (
    <Tile icon={<Timer size={11} />} label="Focus" onClick={() => (active ? open("timer") : t.start(t.focusMin, "Focus"))}>
      {active ? (
        <>
          <Ring value={t.durationMs ? 1 - timerRemaining(t, now) / t.durationMs : 0} size={20} stroke={3} />
          <span className="tabular text-[13px] font-semibold">{formatDuration(timerRemaining(t, now))}</span>
        </>
      ) : (
        <>
          <span className="tabular text-[14px] font-semibold">{t.focusMin}m</span>
          <span className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-black">
            <Play size={10} fill="currentColor" />
          </span>
        </>
      )}
    </Tile>
  );
}

function StatsChip() {
  const s = useLive((x) => x.stats);
  const open = useIsland((x) => x.setActive);
  const stat = (k: string, v: React.ReactNode) => (
    <span className="tabular flex items-baseline gap-1 text-[12.5px] font-semibold">
      {v}
      <span className="text-[9.5px] font-medium text-ink-4">{k}</span>
    </span>
  );
  return (
    <Tile icon={<Activity size={11} />} label="System" onClick={s ? () => open("stats") : undefined}>
      {s ? (
        <div className="flex w-full items-center justify-between gap-2">
          {stat("CPU", `${Math.round(s.cpu)}%`)}
          {stat("RAM", `${Math.round((s.memUsed / Math.max(1, s.memTotal)) * 100)}%`)}
          {s.battery.present && (
            <span className="hidden items-center gap-1 @[150px]:flex">
              <BatteryGlyph b={s.battery} width={16} />
              <span className="tabular text-[12.5px] font-semibold">{s.battery.percent}%</span>
            </span>
          )}
        </div>
      ) : (
        <span className="text-[11px] text-ink-3">…</span>
      )}
    </Tile>
  );
}

function HomePet() {
  const out = usePet((s) => s.out);
  const name = usePet((s) => s.name);
  if (!out) return <Pet size={112} roam={210} />;
  return (
    <div className="flex h-[94px] flex-col items-center justify-center text-center">
      <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-ink-3">
        <PawPrint size={20} />
      </motion.span>
      <span className="text-[11px] text-ink-3">{name} is out exploring</span>
    </div>
  );
}

function WaterChip() {
  const s = useWellness();
  const n = glassesToday(s);
  return (
    <Tile icon={<GlassWater size={11} className="text-[#4fb4ff]" />} label="Water">
      <span className="tabular text-[14px] font-semibold">
        {n}
        <span className="text-[11px] font-medium text-ink-4">/{s.water.goal}</span>
      </span>
      {/* When the tile is wide (on its own row), show the day's glasses instead of empty space. */}
      <span className="hidden flex-1 items-center justify-center gap-[3px] @[220px]:flex">
        {Array.from({ length: s.water.goal }, (_, i) => (
          <span key={i} className={`h-3.5 w-2 rounded-b-[3px] rounded-t-[1px] transition-colors ${i < n ? "bg-[#4fb4ff]" : "bg-white/10"}`} />
        ))}
      </span>
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={(e) => {
          e.stopPropagation();
          logWater(1);
          play("pop");
        }}
        className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#4fb4ff] text-black"
        aria-label="Add a glass"
        title="Add a glass"
      >
        <Plus size={13} strokeWidth={2.6} />
      </motion.button>
    </Tile>
  );
}

function AgentsCard() {
  const sessions = useAgents((s) => s.sessions);
  const open = useIsland((s) => s.setActive);
  const list = Object.values(sessions).sort((a, b) => b.lastAt - a.lastAt).slice(0, 2);
  return (
    <Card onClick={() => open("alerts")}>
      <CardTitle icon={<Bot size={11} />}>Agents</CardTitle>
      {list.length ? (
        <div className="space-y-1.5">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <AgentSpinner state={s.state} color={sourceColor(s.source)} size={15} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                <b className="font-semibold text-ink">{s.project || s.source}</b> · {s.state === "done" ? "finished" : s.state === "waiting" ? "needs you" : s.detail}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-ink-3">No agents running</div>
      )}
    </Card>
  );
}

function RecentCard() {
  const items = useStash((s) => s.items);
  const open = useIsland((s) => s.setActive);
  const recent = [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  return (
    <Card onClick={() => open("stash")}>
      <CardTitle icon={<Archive size={11} />}>Recent in stash</CardTitle>
      {recent.length ? (
        <div className="min-w-0 space-y-1">
          {recent.map((i) => (
            // w-0 + min-w-full: the line never widens the card; long titles end in "…".
            <div key={i.id} className="w-0 min-w-full truncate text-[12px] text-ink-2">
              {itemTitle(i)}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-ink-3">Nothing saved yet</div>
      )}
    </Card>
  );
}

const WIDGETS: Record<HomeWidgetId, { label: string; icon: React.ReactNode; half?: boolean; View: () => React.ReactNode }> = {
  media: { label: "Now playing", icon: <Music2 size={13} />, View: MediaCard },
  tasks: { label: "Today's tasks", icon: <Sparkles size={13} />, View: TasksCard },
  focus: { label: "Focus timer", icon: <Timer size={13} />, half: true, View: FocusChip },
  stats: { label: "System", icon: <Activity size={13} />, half: true, View: StatsChip },
  water: { label: "Water", icon: <GlassWater size={13} />, half: true, View: WaterChip },
  agents: { label: "Agent sessions", icon: <Bot size={13} />, View: AgentsCard },
  recent: { label: "Recent in stash", icon: <Archive size={13} />, View: RecentCard },
};

function HomeEditor({ onDone }: { onDone: () => void }) {
  const { home, set } = useSettings();
  const patch = (p: Partial<HomeLayout>) => set({ home: { ...home, ...p } });
  const opt = (label: string, key: "greeting" | "showDate" | "showPet" | "clock24") => (
    <label className="flex items-center justify-between rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-ink-2">
      {label}
      <Toggle checked={home[key]} onChange={(v) => patch({ [key]: v })} label={label} />
    </label>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex h-full min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">Customize Home</span>
        <div className="flex gap-1">
          <Button size="sm" tone="ghost" onClick={() => set({ home: DEFAULT_HOME })}>
            Reset
          </Button>
          <Button size="sm" tone="accent" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {opt("Greeting", "greeting")}
        {opt("Date", "showDate")}
        {opt("Pet", "showPet")}
        {opt("24-hour clock", "clock24")}
      </div>
      <div className="px-1 text-[10.5px] text-ink-4">Drag to reorder · toggle to show</div>
      <Reorder.Group axis="y" values={home.widgets.map((w) => w.id)} onReorder={(ids) => patch({ widgets: ids.map((id) => home.widgets.find((w) => w.id === id)!) })} className="scroll min-h-0 flex-1 space-y-1 pr-1">
        {home.widgets.map((w) => (
          <Reorder.Item
            key={w.id}
            value={w.id}
            whileDrag={{ scale: 1.03, boxShadow: "0 10px 26px rgba(0,0,0,0.5)" }}
            className="flex cursor-grab items-center gap-2.5 rounded-xl bg-white/[0.045] px-2.5 py-1.5 active:cursor-grabbing"
          >
            <GripVertical size={13} className="text-ink-4" />
            <span className={w.on ? "text-[var(--accent-ink)]" : "text-ink-4"}>{WIDGETS[w.id].icon}</span>
            <span className={`flex-1 text-[12px] ${w.on ? "text-ink" : "text-ink-3"}`}>{WIDGETS[w.id].label}</span>
            <Toggle checked={w.on} onChange={(on) => patch({ widgets: home.widgets.map((x) => (x.id === w.id ? { ...x, on } : x)) })} label={WIDGETS[w.id].label} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </motion.div>
  );
}

/**
 * Turns the widget order into rows: big widgets get a row each, and the small ones are
 * gathered into shared rows of up to three equal tiles, placed where the first one sits.
 */
function packWidgets(ids: HomeWidgetId[]) {
  const small = ids.filter((id) => WIDGETS[id].half);
  const groups: HomeWidgetId[][] = [];
  for (let i = 0; i < small.length; i += 3) groups.push(small.slice(i, i + 3));
  const rows: HomeWidgetId[][] = [];
  for (const id of ids) {
    if (!WIDGETS[id].half) rows.push([id]);
    else {
      const g = groups.find((g) => g[0] === id);
      if (g) rows.push(g);
    }
  }
  return rows;
}

function HomeView() {
  const openPet = useIsland((s) => s.setActive);
  const home = useSettings((s) => s.home);
  const [editing, setEditing] = useState(false);
  const rows = packWidgets(home.widgets.filter((w) => w.on).map((w) => w.id));
  const customize = (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] text-ink-4 transition-colors hover:bg-white/6 hover:text-ink-2"
    >
      <SlidersHorizontal size={11} /> Customize
    </button>
  );
  return (
    <div className="flex h-full gap-3">
      <div className={`relative flex w-[220px] shrink-0 flex-col ${home.showPet ? "justify-between" : "justify-center"}`}>
        <div>
          <Clock />
          {!home.showPet && <div className="mt-2 -ml-2">{customize}</div>}
        </div>
        {home.showPet && (
          <div className="relative flex items-end justify-center pb-5">
            <div className="absolute bottom-6 h-3 w-28 rounded-[50%] bg-[var(--accent)]/18" />
            <HomePet />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between">
              {customize}
              <button onClick={() => openPet("pet")} className="rounded-full px-2 py-0.5 text-[10.5px] text-ink-4 transition-colors hover:bg-white/6 hover:text-ink-2">
                Pet room →
              </button>
            </div>
          </div>
        )}
      </div>
      {editing ? (
        <HomeEditor onDone={() => setEditing(false)} />
      ) : (
        <div className="scroll fade-y -my-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-1 pr-0.5">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.div
                key={row.join("+")}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={softSpring}
                className="flex w-full min-w-0 shrink-0 gap-2 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:basis-0"
              >
                {row.map((id) => {
                  const W = WIDGETS[id];
                  return <W.View key={id} />;
                })}
              </motion.div>
            ))}
          </AnimatePresence>
          {rows.length === 0 && (
            <button onClick={() => setEditing(true)} className="rounded-2xl border border-dashed border-white/12 py-6 text-[12px] text-ink-3 hover:text-ink-2">
              Add widgets to your Home
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const homeModule: IslandModule = {
  id: "home",
  title: "Home",
  icon: Home,
  size: { w: 640, h: 344 },
  View: HomeView,
  description: "Your dashboard — clock, pet, and the widgets you choose. Hover it and press Customize.",
};

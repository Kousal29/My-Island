import { motion } from "motion/react";
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
import { Ring, softSpring } from "../../ui/primitives";
import { Artwork, Transport, appName } from "../media";
import { BatteryGlyph } from "../stats";
import { Checkbox } from "../todos/Checkbox";
import { useNow } from "../timer";
import { useStash } from "../../state/stash";
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
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const [hm, ampm] = time.split(" ");
  return (
    <div>
      <div className="text-[11.5px] font-medium text-ink-3">
        {greeting(now.getHours())} · <span className="text-ink-2">{name}</span> says hi
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="tabular font-display text-[44px] leading-[1.05] font-semibold tracking-tight">{hm}</span>
        {ampm && <span className="text-[14px] font-medium text-ink-3">{ampm}</span>}
      </div>
      <div className="text-[12.5px] text-ink-2">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
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
        <div className="text-[11.5px] text-ink-3">{p.total ? "All done for today 🎉" : "No tasks due today"}</div>
      )}
    </Card>
  );
}

function FocusChip() {
  const t = useTimer();
  const active = timerActive(t);
  const now = useNow(active && t.running, 500);
  const open = useIsland((s) => s.setActive);
  return (
    <Card onClick={() => (active ? open("timer") : t.start(t.focusMin, "Focus"))} className="flex items-center gap-2 !py-2">
      {active ? (
        <>
          <Ring value={t.durationMs ? 1 - timerRemaining(t, now) / t.durationMs : 0} size={22} stroke={3} />
          <span className="tabular text-[13px] font-semibold">{formatDuration(timerRemaining(t, now))}</span>
        </>
      ) : (
        <>
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--accent)] text-black">
            <Play size={10} fill="currentColor" />
          </span>
          <span className="text-[12px] font-medium">Focus {t.focusMin}m</span>
        </>
      )}
      <Timer size={12} className="ml-auto text-ink-4" />
    </Card>
  );
}

function StatsChip() {
  const s = useLive((x) => x.stats);
  const open = useIsland((x) => x.setActive);
  if (!s) return <Card className="!py-2 text-[11px] text-ink-3">Loading…</Card>;
  return (
    <Card onClick={() => open("stats")} className="flex items-center justify-between gap-2 !py-2 text-[11.5px]">
      <span className="tabular text-ink-2">
        <span className="text-ink-3">CPU</span> {Math.round(s.cpu)}%
      </span>
      <span className="tabular text-ink-2">
        <span className="text-ink-3">RAM</span> {Math.round((s.memUsed / Math.max(1, s.memTotal)) * 100)}%
      </span>
      {s.battery.present && (
        <span className="tabular flex items-center gap-1 text-ink-2">
          <BatteryGlyph b={s.battery} width={18} /> {s.battery.percent}%
        </span>
      )}
    </Card>
  );
}

function HomePet() {
  const out = usePet((s) => s.out);
  const name = usePet((s) => s.name);
  if (!out) return <Pet size={112} roam={210} />;
  return (
    <div className="flex h-[94px] flex-col items-center justify-center text-center">
      <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity }} className="text-[20px]">
        🐾
      </motion.span>
      <span className="text-[11px] text-ink-3">{name} is out exploring</span>
    </div>
  );
}

function HomeView() {
  const openPet = useIsland((s) => s.setActive);
  return (
    <div className="flex h-full gap-3">
      <div className="relative flex w-[230px] shrink-0 flex-col justify-between">
        <Clock />
        <div className="relative -mb-1 flex items-end justify-center">
          <div className="absolute bottom-1 h-3 w-28 rounded-[50%] bg-[var(--accent)]/18 blur-[2px]" />
          <HomePet />
          <button onClick={() => openPet("pet")} className="absolute right-0 bottom-1 rounded-full px-2 py-0.5 text-[10.5px] text-ink-4 hover:bg-white/6 hover:text-ink-2">
            Pet room →
          </button>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <MediaCard />
        <TasksCard />
        <div className="grid grid-cols-2 gap-2">
          <FocusChip />
          <StatsChip />
        </div>
      </div>
    </div>
  );
}

export const homeModule: IslandModule = {
  id: "home",
  title: "Home",
  icon: Home,
  size: { w: 620, h: 330 },
  View: HomeView,
  description: "Clock, your pet, and a glance at music, today's tasks, focus and system health.",
};

import { motion } from "motion/react";
import { Activity, ArrowDown, ArrowUp, BatteryWarning, Cpu, HardDrive, MemoryStick, Plug, Zap } from "lucide-react";
import { useId, useState } from "react";
import type { Battery } from "../../lib/bridge";
import { cx, formatBytes, formatRate, formatUptime } from "../../lib/util";
import { useLive } from "../../state/live";
import { Empty, Ring, softSpring } from "../../ui/primitives";
import type { IslandModule } from "../types";

/** Single-series sparkline: 2px line, faint area, hover crosshair + tooltip. */
export function Sparkline({
  data,
  color,
  height = 34,
  max,
  format,
  sampleSec = 1.5,
}: {
  data: number[];
  color: string;
  height?: number;
  max?: number;
  format: (v: number) => string;
  sampleSec?: number;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 100;
  const n = Math.max(2, data.length);
  const top = max ?? Math.max(1, ...data) * 1.15;
  const pts = data.map((v, i) => [(i / (n - 1)) * W, height - 2 - (Math.min(v, top) / top) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height} Z` : "";
  const hp = hover !== null ? pts[hover] : null;

  return (
    <div
      className="relative"
      style={{ height }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
        setHover(i >= 0 && i < data.length ? i : null);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.28} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`M0 ${height - 0.5} H${W}`} stroke="rgb(255 255 255 / 0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {pts.length > 1 && (
          <>
            <path d={area} fill={`url(#g${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {hp && <path d={`M${hp[0]} 0 V${height}`} stroke="rgb(255 255 255 / 0.3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && hover !== null && (
        <>
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${hp[0]}%`, top: hp[1], background: color }}
          />
          <span
            className="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded-md bg-panel-3 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-ink shadow-lg ring-1 ring-white/10"
            style={{ left: `${Math.min(85, Math.max(15, hp[0]))}%` }}
          >
            {format(data[hover])}
            <span className="ml-1 font-normal text-ink-3">{Math.round((data.length - 1 - hover) * sampleSec)}s ago</span>
          </span>
        </>
      )}
    </div>
  );
}

function Tile({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={softSpring}
      className={cx("flex min-w-0 flex-col rounded-2xl bg-white/[0.045] p-3 ring-1 ring-white/[0.05]", className)}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {icon}
        {title}
      </div>
      {children}
    </motion.div>
  );
}

export function BatteryGlyph({ b, width = 26 }: { b: Battery; width?: number }) {
  const low = !b.plugged && b.percent <= 20;
  const fill = low ? "var(--color-bad)" : b.charging || b.plugged ? "var(--color-good)" : "rgb(255 255 255 / 0.9)";
  const h = width * 0.5;
  return (
    <div className="relative flex items-center" style={{ width: width + 3, height: h }}>
      <div className="relative h-full overflow-hidden rounded-[4px] ring-[1.5px] ring-white/45" style={{ width }}>
        <motion.div
          className="absolute inset-y-[2px] left-[2px] rounded-[2px]"
          initial={false}
          animate={{ width: `calc(${Math.max(6, b.percent)}% - 4px)` }}
          transition={softSpring}
          style={{ background: fill }}
        />
        {b.charging && (
          <motion.span className="absolute inset-0 grid place-items-center text-black" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <Zap size={h * 0.8} fill="currentColor" strokeWidth={0} />
          </motion.span>
        )}
      </div>
      <div className="ml-[1.5px] h-[40%] w-[2px] rounded-r-sm bg-white/45" />
    </div>
  );
}

function StatsView() {
  const { stats, cpuHistory, memHistory, netHistory } = useLive();
  if (!stats) return <Empty icon="📊" title="Gathering stats…" hint="First readings arrive within a couple of seconds." />;
  const memPct = stats.memTotal ? stats.memUsed / stats.memTotal : 0;
  const diskPct = stats.diskTotal ? stats.diskUsed / stats.diskTotal : 0;
  const b = stats.battery;
  const low = b.present && !b.plugged && b.percent <= 20;

  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-2">
      <Tile title="CPU" icon={<Cpu size={11} />}>
        <div className="flex items-baseline gap-1">
          <span className="tabular font-display text-[24px] leading-none font-semibold">{Math.round(stats.cpu)}</span>
          <span className="text-[12px] text-ink-3">%</span>
          <span className="ml-auto text-[10.5px] text-ink-3">{stats.cores.length} threads</span>
        </div>
        <div className="mt-auto">
          <Sparkline data={cpuHistory} color="var(--accent)" max={100} format={(v) => `${Math.round(v)}%`} />
          <div className="mt-1.5 flex h-2 gap-[2px]" title="Per-thread load">
            {stats.cores.slice(0, 32).map((c, i) => (
              <span key={i} className="flex-1 rounded-[2px] bg-[var(--accent)] transition-opacity duration-700" style={{ opacity: 0.12 + (c / 100) * 0.88 }} />
            ))}
          </div>
        </div>
      </Tile>

      <Tile title="Memory" icon={<MemoryStick size={11} />}>
        <div className="flex items-center gap-2.5">
          <Ring value={memPct} size={40} stroke={5} color="#4fb4ff">
            <span className="tabular text-[10px] font-bold">{Math.round(memPct * 100)}</span>
          </Ring>
          <div className="min-w-0 leading-tight">
            <div className="tabular text-[13px] font-semibold">{formatBytes(stats.memUsed)}</div>
            <div className="text-[10.5px] text-ink-3">of {formatBytes(stats.memTotal, 0)}</div>
          </div>
        </div>
        <div className="mt-auto">
          <Sparkline data={memHistory} color="#4fb4ff" max={100} format={(v) => `${Math.round(v)}%`} height={26} />
        </div>
      </Tile>

      <Tile title="Battery" icon={b.plugged ? <Plug size={11} /> : <BatteryWarning size={11} />}>
        {b.present ? (
          <>
            <div className="flex items-center gap-2.5">
              <BatteryGlyph b={b} width={34} />
              <span className="tabular font-display text-[24px] leading-none font-semibold">{b.percent}</span>
              <span className="-ml-1.5 text-[12px] text-ink-3">%</span>
            </div>
            <div className="mt-auto space-y-0.5 text-[11px]">
              <div className={cx("flex items-center gap-1 font-medium", low ? "text-bad" : "text-ink-2")}>
                {low && <BatteryWarning size={12} />}
                {b.charging ? "Charging" : b.plugged ? "Plugged in · full" : low ? "Low battery" : "On battery"}
              </div>
              <div className="text-ink-3">
                {b.secondsLeft && !b.plugged ? `${formatUptime(b.secondsLeft)} remaining` : b.charging ? "Topping up ⚡" : "Power source: AC"}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-auto text-[11.5px] text-ink-3">
            <Plug size={18} className="mb-1 text-ink-2" />
            Desktop power — no battery detected
          </div>
        )}
      </Tile>

      <Tile title="Download" icon={<ArrowDown size={11} />}>
        <div className="tabular text-[17px] leading-none font-semibold">{formatRate(stats.netDown)}</div>
        <div className="mt-auto">
          <Sparkline data={netHistory.map((n) => n.down)} color="#3fe0b0" format={formatRate} />
        </div>
      </Tile>

      <Tile title="Upload" icon={<ArrowUp size={11} />}>
        <div className="tabular text-[17px] leading-none font-semibold">{formatRate(stats.netUp)}</div>
        <div className="mt-auto">
          <Sparkline data={netHistory.map((n) => n.up)} color="#ff9f6e" format={formatRate} />
        </div>
      </Tile>

      <Tile title="System" icon={<Activity size={11} />}>
        <div className="space-y-2 text-[11.5px]">
          <div>
            <div className="mb-1 flex justify-between text-ink-2">
              <span className="inline-flex items-center gap-1"><HardDrive size={11} /> Disk</span>
              <span className="tabular text-ink-3">{formatBytes(stats.diskTotal - stats.diskUsed, 0)} free</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-white/75" initial={{ width: 0 }} animate={{ width: `${diskPct * 100}%` }} transition={softSpring} />
            </div>
          </div>
          <div className="flex justify-between text-ink-3">
            <span>Uptime</span>
            <span className="tabular text-ink-2">{formatUptime(stats.uptime)}</span>
          </div>
          <div className="flex justify-between text-ink-3">
            <span>Processes</span>
            <span className="tabular text-ink-2">{stats.processes}</span>
          </div>
          {stats.swapTotal > 0 && (
            <div className="flex justify-between text-ink-3">
              <span>Page file</span>
              <span className="tabular text-ink-2">{formatBytes(stats.swapUsed, 0)}</span>
            </div>
          )}
        </div>
      </Tile>
    </div>
  );
}

export const statsModule: IslandModule = {
  id: "stats",
  title: "System",
  icon: Activity,
  size: { w: 600, h: 340 },
  View: StatsView,
  description: "Live CPU, memory, battery, network and disk with 90-second history.",
};

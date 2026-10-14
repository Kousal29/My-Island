import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import { Activity as ActivityIcon, ArrowUpRight, Bell, BellOff, Bot, Check, CheckCheck, ChevronRight, Copy, Mic, MoreHorizontal, Phone, Plug, Trash2, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, isTauri } from "../../lib/bridge";
import { cx, timeAgo } from "../../lib/util";
import { useAlerts, type Alert } from "../../state/alerts";
import { useAgents } from "../../state/agents";
import { toast } from "../../state/toast";
import { Button, Chip, Empty, HScroll, IconButton, Menu, spring } from "../../ui/primitives";
import type { Activity, IslandModule } from "../types";
import { SessionsSection, useSessionActivity } from "./sessions";

const AGENT_SNIPPET = `curl -s -X POST http://127.0.0.1:47823/notify -H "Content-Type: application/json" -d '{"source":"My agent","kind":"done","title":"Finished","message":"All tests pass"}'`;

export function AlertIcon({ a, size = 32 }: { a: Pick<Alert, "source" | "kind"> & { icon?: string | null; app?: string }; size?: number }) {
  const shared = useAlerts((s) => (a.app ? s.appIcons[a.app] : undefined));
  const src = a.icon ?? shared;
  if (src) return <img src={src} draggable={false} className="shrink-0 rounded-[9px] object-contain" style={{ width: size, height: size }} />;
  const agent = a.source === "agent";
  const color = a.kind === "attention" ? "#ffc94a" : a.kind === "done" ? "#3fe0b0" : a.kind === "call" ? "#3fe0b0" : "#8b7bff";
  const Icon = agent ? Bot : a.kind === "call" ? Phone : Bell;
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

function AccessBanner() {
  const access = useAlerts((s) => s.access);
  if (access === "allowed" || access === "pending") return null;
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl bg-warn/10 px-3 py-2 ring-1 ring-warn/20">
      <BellOff size={15} className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-2">
        {access === "denied" ? "Windows is blocking notification access." : "Notification access isn't available on this PC."} Turn on
        <b className="text-ink"> “Notification access”</b> for apps in Windows Settings.
      </div>
      {access === "denied" && (
        <Button size="sm" onClick={() => void api.openUrl("ms-settings:privacy-notifications")}>
          Open settings
        </Button>
      )}
    </motion.div>
  );
}

/** Claude's starburst mark (static). */
function ClaudeMark({ size = 34 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: "linear-gradient(135deg, #e08a6c, #c4613f)" }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="11" y="1.5" width="2" height="8" rx="1" fill="#fff" transform={`rotate(${i * 45} 12 12)`} />
        ))}
      </svg>
    </span>
  );
}

export function AgentsCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [others, setOthers] = useState(false);
  const live = useAgents((s) => Object.values(s.sessions).filter((x) => x.state !== "done").length);
  useEffect(() => {
    void api.claudeCodeConnected().then(setConnected);
  }, []);
  const connect = async () => {
    setBusy(true);
    try {
      const path = await api.connectClaudeCode();
      setConnected(true);
      toast(`Claude Code connected — hooks added to ${path.split(/[\/]/).slice(-2).join("/")}`);
    } catch (e) {
      toast(`Couldn't connect: ${String(e)}`, undefined, "bad");
    } finally {
      setBusy(false);
    }
  };
  const feature = (icon: React.ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[10.5px] text-ink-2">
      {icon}
      {label}
    </span>
  );
  if (connected && !others) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 flex items-center gap-2.5 rounded-2xl py-2 pr-2 pl-2.5"
        style={{ background: "linear-gradient(135deg, rgba(217,119,87,0.14), rgba(217,119,87,0.03))", boxShadow: "inset 0 0 0 1px rgba(217,119,87,0.22)" }}
      >
        <ClaudeMark size={26} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink">Claude Code</div>
          <div className="truncate text-[10.5px] text-ink-3">Live progress, jump to answer and finish summaries are on</div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-good/15 px-2 py-1 text-[10.5px] font-semibold text-good">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          {live ? `${live} live` : "Connected"}
        </span>
        <IconButton label="Other agents" size="sm" onClick={() => setOthers(true)}>
          <MoreHorizontal size={14} />
        </IconButton>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-2 overflow-hidden rounded-2xl p-3.5"
      style={{ background: "linear-gradient(135deg, rgba(217,119,87,0.17), rgba(217,119,87,0.05) 55%, rgba(255,255,255,0.02))", boxShadow: "inset 0 0 0 1px rgba(217,119,87,0.28)" }}
    >
      <div className="pointer-events-none absolute -top-14 -right-10 h-32 w-32 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(217,119,87,0.22), transparent)" }} />
      <div className="relative flex items-center gap-3">
        <ClaudeMark />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">Claude Code</div>
          <div className="text-[11px] text-ink-3">See what your coding agent is doing, right in the notch.</div>
        </div>
        <span
          className={cx(
            "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold",
            connected ? "bg-good/15 text-good" : "bg-white/8 text-ink-3",
          )}
        >
          <span className={cx("h-1.5 w-1.5 rounded-full", connected ? "bg-good" : "bg-ink-4")} />
          {connected === null ? "Checking…" : connected ? (live ? `${live} live` : "Connected") : "Not connected"}
        </span>
      </div>
      <div className="relative mt-2.5 flex flex-wrap gap-1.5">
        {feature(<ActivityIcon size={10} />, "Live progress")}
        {feature(<ArrowUpRight size={10} />, "Jump to answer")}
        {feature(<Check size={10} />, "Finish summaries")}
      </div>
      {!connected && (
        <div className="relative mt-3 flex items-center gap-2.5">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            disabled={busy || connected === null || !isTauri}
            onClick={connect}
            className="flex h-8 items-center gap-1.5 rounded-full px-4 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#d97757" }}
          >
            <Plug size={13} /> {busy ? "Connecting…" : "Connect"}
          </motion.button>
          <span className="text-[10.5px] leading-snug text-ink-4">Adds hooks to ~/.claude/settings.json · a backup is kept</span>
        </div>
      )}
      <button onClick={() => setOthers(!others)} className="relative mt-2.5 flex items-center gap-1 text-[10.5px] text-ink-3 hover:text-ink-2">
        <motion.span animate={{ rotate: others ? 90 : 0 }} className="inline-flex">
          <ChevronRight size={11} />
        </motion.span>
        Other agents (Codex, Aider, scripts…)
      </button>
      <AnimatePresence initial={false}>
        {others && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative overflow-hidden">
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-black/35 py-1.5 pr-1 pl-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-3">{AGENT_SNIPPET}</code>
              <IconButton
                label="Copy command"
                size="sm"
                onClick={async () => {
                  await writeText(AGENT_SNIPPET);
                  toast("Copied — call it from any agent or script");
                }}
              >
                <Copy size={12} />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AlertRow({ a }: { a: Alert }) {
  const { remove, toggleMute, mutedApps } = useAlerts();
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      transition={spring}
      className="group flex items-start gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/5"
    >
      <div className="relative">
        <AlertIcon a={a} />
        {!a.read && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-island" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
          <span className="font-semibold text-ink-2">{a.app}</span>
          {a.project && <span>· {a.project}</span>}
          <span className="ml-auto shrink-0">{timeAgo(a.at)}</span>
        </div>
        <div className="truncate text-[12.5px] font-medium text-ink">{a.title}</div>
        {a.body && <div className="line-clamp-2 text-[11.5px] leading-snug text-ink-3">{a.body}</div>}
      </div>
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <Menu
          trigger={(open) => (
            <IconButton label="More" size="sm" onClick={open}>
              <MoreHorizontal size={14} />
            </IconButton>
          )}
          items={[
            a.source === "app" && {
              label: mutedApps.includes(a.app) ? `Unmute ${a.app}` : `Mute ${a.app}`,
              icon: <BellOff size={13} />,
              onSelect: () => toggleMute(a.app),
            },
            { label: "Remove", icon: <Trash2 size={13} />, danger: true, onSelect: () => remove(a.id) },
          ]}
        />
      </div>
    </motion.div>
  );
}

function AlertsView() {
  const { alerts, markAllRead, clear } = useAlerts();
  const [filter, setFilter] = useState<"all" | "app" | "agent">("all");
  const shown = useMemo(() => alerts.filter((a) => filter === "all" || a.source === filter), [alerts, filter]);
  useEffect(() => {
    const t = setTimeout(markAllRead, 1500);
    return () => clearTimeout(t);
  }, [alerts.length, markAllRead]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-1">
        <HScroll className="flex-1" watch={filter}>
          {(
            [
              ["all", "All"],
              ["app", "Apps"],
              ["agent", "Agents"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={filter === id} onClick={() => setFilter(id)} layoutGroup="alerts-filter">
              {label}
            </Chip>
          ))}
        </HScroll>
        <IconButton label="Mark all read" size="sm" onClick={markAllRead}>
          <CheckCheck size={14} />
        </IconButton>
        <IconButton
          label="Clear all"
          size="sm"
          tone="danger"
          onClick={() => {
            const before = useAlerts.getState().alerts;
            clear();
            toast("Cleared notifications", { label: "Undo", run: () => useAlerts.setState({ alerts: before }) });
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
      <AccessBanner />
      <div className="scroll fade-y -mx-1 min-h-0 flex-1 px-1 py-1">
        {filter !== "app" && <AgentsCard />}
        {filter !== "app" && <SessionsSection />}
        {shown.length === 0 ? (
          <Empty icon={<Bell size={20} />} title="All quiet" hint="Notifications from your apps, calls and coding agents show up here." />
        ) : (
          <div className="mt-1.5 space-y-0.5">
            <AnimatePresence initial={false}>
              {shown.map((a) => (
                <AlertRow key={a.id} a={a} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s % 60).padStart(2, "0")}`;
};

/** Live "On a call" pill while a meeting app is using the mic/camera. */
function useCallActivity(): Activity | null {
  const call = useAlerts((s) => s.call);
  const [, force] = useState(0);
  useEffect(() => {
    if (!call) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [call]);
  if (!call) return null;
  return {
    priority: 46,
    width: 270,
    opens: "alerts",
    left: (
      <span className="relative grid h-5 w-5 place-items-center rounded-full bg-bad/20 text-bad">
        {call.camera ? <Video size={11} /> : <Mic size={11} />}
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 animate-[breathe_1.6s_ease-in-out_infinite] rounded-full bg-bad" />
      </span>
    ),
    center: (
      <span className={cx("truncate text-[12px] font-medium text-ink-2")}>
        {call.meeting ? "On a call" : "Mic in use"} · {call.app}
      </span>
    ),
    right: <span className="tabular text-[12px] font-semibold text-ink">{fmt(Date.now() - call.since)}</span>,
  };
}

export const alertsModule: IslandModule = {
  id: "alerts",
  title: "Alerts",
  icon: Bell,
  size: { w: 620, h: 432 },
  View: AlertsView,
  // Calls and live agent sessions both surface here; the more urgent one wins.
  useActivity: () => {
    const call = useCallActivity();
    const agent = useSessionActivity();
    if (!call) return agent;
    if (!agent) return call;
    return agent.priority >= call.priority ? agent : call;
  },
  description: "Notifications from your apps and coding agents, plus a live indicator while you're on a call.",
};

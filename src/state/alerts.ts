import { create } from "zustand";
import { on, type AgentEvent, type CallState, type NotifyAccess, type ToastEvent } from "../lib/bridge";
import { persist } from "../lib/persist";
import { uid } from "../lib/util";
import { sessionSummary, useAgents, type AgentSession } from "./agents";
import { RETENTION_MS, useSettings } from "./settings";

export interface Alert {
  id: string;
  source: "app" | "agent";
  app: string;
  title: string;
  body: string;
  icon?: string | null;
  /** app: "message" | "call"; agent: "attention" | "done" | "info" */
  kind: string;
  project?: string;
  at: number;
  read: boolean;
}

interface AlertState {
  alerts: Alert[];
  call: CallState | null;
  access: NotifyAccess;
  mutedApps: string[];
  /** One icon per app (not per notification) keeps memory and the data file small. */
  appIcons: Record<string, string>;
  add: (a: Omit<Alert, "id" | "read">) => Alert;
  remove: (id: string) => void;
  clear: () => void;
  markAllRead: () => void;
  toggleMute: (app: string) => void;
}

const MAX = 120;

export const useAlerts = create<AlertState>((set, get) => ({
  alerts: [],
  call: null,
  access: "pending",
  mutedApps: [],
  appIcons: {},
  add: ({ icon, ...a }) => {
    const alert: Alert = { ...a, id: uid(), read: false };
    let appIcons = get().appIcons;
    if (icon && appIcons[a.app] !== icon) {
      // Keep at most 40 app icons (oldest dropped).
      const entries = Object.entries({ ...appIcons, [a.app]: icon }).slice(-40);
      appIcons = Object.fromEntries(entries);
    }
    set({ alerts: [alert, ...get().alerts].slice(0, MAX), appIcons });
    return alert;
  },
  remove: (id) => set({ alerts: get().alerts.filter((a) => a.id !== id) }),
  clear: () => set({ alerts: [] }),
  markAllRead: () => set({ alerts: get().alerts.map((a) => (a.read ? a : { ...a, read: true })) }),
  toggleMute: (app) => {
    const m = get().mutedApps;
    set({ mutedApps: m.includes(app) ? m.filter((x) => x !== app) : [...m, app] });
  },
}));

/** Clears notification history older than the user's retention setting. */
export function startAlertSweeper() {
  const sweep = () => {
    const keep = RETENTION_MS[useSettings.getState().alertRetention] ?? Infinity;
    if (keep === Infinity) return;
    const cutoff = Date.now() - keep;
    const { alerts } = useAlerts.getState();
    if (alerts.some((a) => a.at < cutoff)) useAlerts.setState({ alerts: alerts.filter((a) => a.at >= cutoff) });
  };
  sweep();
  const id = setInterval(sweep, 60_000);
  const off = useSettings.subscribe((s, p) => s.alertRetention !== p.alertRetention && sweep());
  return () => {
    clearInterval(id);
    off();
  };
}

export const unreadCount = (alerts: Alert[]) => alerts.filter((a) => !a.read).length;

/** Subscribes to native events; returns callbacks so App can show activities/reactions. */
export function startAlertFeeds(handlers: {
  onToast: (t: ToastEvent, a: Alert) => void;
  onAgent: (e: AgentEvent, a: Alert | null, session: AgentSession | null) => void;
  onCall: (c: CallState, prev: CallState | null) => void;
  shouldMirror: (app: string) => boolean;
}) {
  const offs = [
    on("notify://status", (access) => useAlerts.setState({ access })),
    on("notify://toast", (t) => {
      if (!handlers.shouldMirror(t.app) || useAlerts.getState().mutedApps.includes(t.app)) return;
      const a = useAlerts.getState().add({ source: "app", app: t.app, title: t.title, body: t.body, icon: t.icon, kind: t.kind, at: t.at });
      handlers.onToast(t, a);
    }),
    on("agent://notify", (e) => {
      const session = useAgents.getState().apply(e);
      // Live steps (start/tool) drive the session view; only milestones go into history.
      let a: Alert | null = null;
      if (e.kind === "attention" || e.kind === "done" || e.kind === "info") {
        const body = e.kind === "done" && session ? [e.body, sessionSummary(session)].filter(Boolean).join(" — ") : e.body;
        a = useAlerts.getState().add({ source: "agent", app: e.source, title: e.title, body, kind: e.kind, project: e.project, at: e.at });
      }
      handlers.onAgent(e, a, session);
    }),
    on("call://state", (c) => {
      const prev = useAlerts.getState().call;
      useAlerts.setState({ call: c.active ? c : null });
      handlers.onCall(c, prev);
    }),
  ];
  return () => offs.forEach((f) => f());
}

export const hydrateAlerts = () =>
  persist(useAlerts, {
    key: "alerts",
    version: 2,
    // v2: icons moved out of each alert into a per-app map.
    migrations: { 1: (d) => ({ ...d, alerts: (d.alerts ?? []).map(({ icon: _i, ...a }: Alert) => a), appIcons: {} }) },
    pick: (s) => ({ alerts: s.alerts.slice(0, 60), mutedApps: s.mutedApps, appIcons: s.appIcons }),
    apply: (d) => d,
  });

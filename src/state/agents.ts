import { create } from "zustand";
import { api, type AgentEvent } from "../lib/bridge";
import { RETENTION_MS, useSettings } from "./settings";
import { persist } from "../lib/persist";

export type SessionState = "working" | "waiting" | "done";

export interface AgentSession {
  id: string;
  source: string;
  project: string;
  state: SessionState;
  startedAt: number;
  lastAt: number;
  endedAt?: number;
  /** What it's doing right now, e.g. "Editing Island.tsx". */
  detail: string;
  prompt: string;
  /** Message from a "needs input" / "finished" event. */
  message: string;
  tools: number;
  /** Basenames of files written/edited this run (most recent first). */
  files: string[];
  actions: { at: number; detail: string }[];
  /** Terminal/IDE window the agent runs in (0 if unknown) and its app. */
  window: number;
  host: string;
}

interface AgentsState {
  sessions: Record<string, AgentSession>;
  apply: (e: AgentEvent) => AgentSession | null;
  dismiss: (id: string) => void;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Machine-generated "prompts" (e.g. `<task-notification>…`), not something the user typed. */
export const isInternalPrompt = (p: string) => /^\s*<[a-z][\w-]*>/i.test(p);

export const useAgents = create<AgentsState>((set, get) => ({
  sessions: {},
  apply: (e) => {
    const all = { ...get().sessions };
    const prev = all[e.session];
    const fresh = (): AgentSession => ({
      id: e.session,
      source: e.source,
      project: e.project,
      state: "working",
      startedAt: e.at,
      lastAt: e.at,
      detail: "Thinking…",
      prompt: "",
      message: "",
      tools: 0,
      files: [],
      actions: [],
      window: e.window,
      host: e.host,
    });
    let s: AgentSession;
    switch (e.kind) {
      case "start":
        // Claude Code also "submits" its own messages (a background task finishing, slash
        // commands). Those continue the current task: keep the user's prompt and progress.
        if (isInternalPrompt(e.body)) {
          s = prev
            ? { ...prev, state: "working", lastAt: e.at, endedAt: undefined, detail: "Picking up a background task…" }
            : { ...fresh(), detail: "Picking up a background task…" };
        } else s = { ...fresh(), prompt: e.body, detail: e.detail || "Thinking…" };
        break;
      case "tool": {
        const base = prev && prev.state !== "done" ? prev : fresh();
        const files = e.file ? [baseName(e.file), ...base.files.filter((f) => f !== baseName(e.file))].slice(0, 20) : base.files;
        s = {
          ...base,
          state: "working",
          lastAt: e.at,
          detail: e.detail || base.detail,
          tools: base.tools + 1,
          files,
          actions: [...base.actions, { at: e.at, detail: e.detail }].slice(-8),
        };
        break;
      }
      case "attention":
        s = { ...(prev ?? fresh()), state: "waiting", lastAt: e.at, message: e.body, detail: "Waiting for you" };
        break;
      case "done":
        s = { ...(prev ?? fresh()), state: "done", lastAt: e.at, endedAt: e.at, message: e.body, detail: "Finished" };
        break;
      case "subdone":
        if (!prev) return null;
        s = { ...prev, lastAt: e.at, actions: [...prev.actions, { at: e.at, detail: "Subagent finished" }].slice(-8) };
        break;
      case "end":
        delete all[e.session];
        set({ sessions: all });
        return prev ?? null;
      default:
        return null;
    }
    if (e.window) s = { ...s, window: e.window, host: e.host };
    all[e.session] = s;
    set({ sessions: all });
    return s;
  },
  dismiss: (id) => {
    const all = { ...get().sessions };
    delete all[id];
    set({ sessions: all });
  },
}));

/** Drop finished sessions after a while and forget ones that went silent. */
export function startAgentSweeper() {
  const id = setInterval(() => {
    const now = Date.now();
    const keepDone = RETENTION_MS[useSettings.getState().sessionRetention] ?? 15 * 60_000;
    const all = useAgents.getState().sessions;
    let changed = false;
    const next: Record<string, AgentSession> = {};
    for (const s of Object.values(all)) {
      // Finished: user's retention setting. Still "working" but silent for 30 min: the agent is gone.
      const stale = s.state === "done" ? now - (s.endedAt ?? s.lastAt) > keepDone : now - s.lastAt > 30 * 60_000;
      if (stale) changed = true;
      else next[s.id] = s;
    }
    if (changed) useAgents.setState({ sessions: next });
  }, 30_000);
  return () => clearInterval(id);
}

/** "VS Code", "Terminal", "Cursor"… from the host executable. */
export function hostName(exe: string) {
  const e = exe.toLowerCase().replace(/\.exe$/, "");
  const known: Record<string, string> = {
    code: "VS Code", "code - insiders": "VS Code", cursor: "Cursor", windsurf: "Windsurf", antigravity: "Antigravity", "antigravity ide": "Antigravity",
    windowsterminal: "Terminal", powershell: "PowerShell", pwsh: "PowerShell", cmd: "Terminal", conhost: "Terminal",
    "idea64": "IntelliJ", webstorm64: "WebStorm", pycharm64: "PyCharm", zed: "Zed", wezterm: "WezTerm", alacritty: "Alacritty",
  };
  if (known[e]) return known[e];
  if (!e) return "terminal";
  return e
    .split(/[\s_-]+/)
    .map((w) => (w === "ide" ? "IDE" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function focusSession(s: Pick<AgentSession, "window">) {
  if (s.window) void api.focusSourceWindow(s.window);
}

export function sessionSummary(s: AgentSession) {
  const ms = (s.endedAt ?? Date.now()) - s.startedAt;
  // We only saw the end (e.g. the session started before the island was running).
  if (!s.tools && ms < 2000) return "";
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const dur = m ? `${m}m ${sec}s` : `${sec}s`;
  const parts = [dur, `${s.tools} step${s.tools === 1 ? "" : "s"}`];
  if (s.files.length) parts.push(`${s.files.length} file${s.files.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export const hydrateAgents = () =>
  persist(useAgents, {
    key: "agents",
    version: 1,
    pick: (s) => ({ sessions: s.sessions }),
    apply: (d) => d,
  });

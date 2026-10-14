import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface HitRect { x: number; y: number; w: number; h: number }

export interface MediaState {
  active: boolean;
  title: string;
  artist: string;
  album: string;
  appId: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  sampledAt: number;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
  artwork: string | null;
}

export interface Battery { present: boolean; percent: number; charging: boolean; plugged: boolean; secondsLeft: number | null }

export interface Stats {
  cpu: number;
  cores: number[];
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  netDown: number;
  netUp: number;
  diskUsed: number;
  diskTotal: number;
  uptime: number;
  processes: number;
  battery: Battery;
}

export interface MonitorInfo { index: number; name: string; width: number; height: number; scale: number; primary: boolean }
export interface LinkMeta { url: string; title?: string; description?: string; image?: string; favicon?: string; siteName?: string }
export interface FileMeta { path: string; name: string; ext: string; isDir: boolean; size: number; exists: boolean; modified?: number }
export interface ClipEvent { text: string | null; files: string[] }
export type DragKind = "files" | "link" | "text" | "unknown";
export interface DragPayload { phase: "enter" | "over" | "leave" | "drop"; kind: DragKind; count: number; files: string[]; url: string | null; text: string | null }

interface Events {
  "island://hover": boolean;
  "island://fullscreen": boolean;
  "island://open": string;
  "island://blur": null;
  "media://update": MediaState;
  "stats://update": Stats;
  "clipboard://changed": ClipEvent;
  "island://drag": DragPayload;
}

export function on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
  if (!isTauri) return () => {};
  let un: UnlistenFn | undefined;
  let dead = false;
  listen<Events[K]>(event, (e) => cb(e.payload)).then((u) => (dead ? u() : (un = u)));
  return () => {
    dead = true;
    un?.();
  };
}

function call<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (!isTauri) return Promise.resolve(fallback as T);
  return invoke<T>(cmd, args);
}

export const api = {
  setHitRect: (rect: HitRect | null) => call<void>("set_hit_rect", { rect }),
  setForceInteractive: (value: boolean) => call<void>("set_force_interactive", { value }),
  listMonitors: () => call<MonitorInfo[]>("list_monitors", undefined, []),
  setMonitor: (index: number) => call<void>("set_monitor", { index }),
  setCompact: (value: boolean) => call<void>("set_compact", { value }),
  setVisible: (visible: boolean) => call<void>("set_visible", { visible }),
  focus: () => call<void>("focus_island"),
  setAutohideFullscreen: (value: boolean) => call<void>("set_autohide_fullscreen", { value }),
  media: (action: "toggle" | "play" | "pause" | "next" | "prev" | "seek", value?: number) =>
    call<void>("media_control", { action, value: value ?? null }),
  getVolume: () => call<{ level: number; muted: boolean }>("get_volume", undefined, { level: 0.5, muted: false }),
  setVolume: (level: number) => call<void>("set_volume", { level }),
  setMute: (muted: boolean) => call<void>("set_mute", { muted }),
  setClipboardCapture: (value: boolean) => call<void>("set_clipboard_capture", { value }),
  linkMeta: (url: string) => call<LinkMeta>("fetch_link_meta", { url }, { url }),
  fileMeta: (paths: string[]) => call<FileMeta[]>("file_meta", { paths }, []),
  openPath: (path: string) => call<void>("open_path", { path }),
  revealPath: (path: string) => call<void>("reveal_path", { path }),
  openUrl: (url: string) => call<void>("open_url", { url }),
  initDropTarget: () => call<void>("init_drop_target"),
};

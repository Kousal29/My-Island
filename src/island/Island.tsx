import { AnimatePresence, motion } from "motion/react";
import { Home as HomeIcon, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, isTauri, on, type DragPayload } from "../lib/bridge";
import { isEditableTarget } from "../lib/util";
import { MODULES } from "../modules/registry";
import { SETTINGS_SIZE } from "../modules/settings";
import { showActivity } from "../state/activities";
import { useIsland } from "../state/island";
import { changeVolume, useLive } from "../state/live";
import { useSettings } from "../state/settings";
import { useStash } from "../state/stash";
import { ALL, useWorkspaces } from "../state/workspaces";
import { play } from "../lib/sound";
import { prepareBuddy, togglePetOut } from "../state/buddy";
import { usePet } from "../state/pet";
import { toast } from "../state/toast";
import { CollapsedContent, IDLE_H, idleWidth, useCurrentActivity } from "./Collapsed";
import { ExpandedContent, useEnabledModules } from "./Expanded";

async function handleDrop(p: DragPayload) {
  const stash = useStash.getState();
  const urlLike = (t: string) => /^(https?:\/\/|www\.)\S+$/i.test(t.trim());
  if (p.kind === "files" && p.files.length) {
    const n = await stash.addFiles(p.files);
    toast(n ? `Stashed ${n} file${n > 1 ? "s" : ""}` : "Already in your stash");
  } else if (p.kind === "link" && p.url) {
    stash.addLink(p.url);
    toast("Link saved");
  } else if (p.text) {
    if (urlLike(p.text)) {
      stash.addLink(p.text.trim());
      toast("Link saved");
    } else {
      const firstLine = p.text.trim().split("\n")[0].slice(0, 60);
      stash.addNote(p.text, firstLine.length < p.text.trim().length ? firstLine : "");
      toast("Saved as a doc");
    }
  } else {
    return;
  }
  play("success");
}

/** Opening: a soft spring with a hint of overshoot, like the iPhone island. */
const EXPAND = { type: "spring", stiffness: 330, damping: 29, mass: 0.95 } as const;
/** Closing: quick and decisive — content fades first, then the shape tucks away. */
const COLLAPSE = { type: "tween", duration: 0.36, ease: [0.32, 0.72, 0, 1] } as const;
/** Hover peeks, activities resizing the pill. */
const HOVER = { type: "spring", stiffness: 520, damping: 36, mass: 0.8 } as const;
const PILL_TOP = 8;
const SLIM_H = 8;

function VolumeHud({ level, muted }: { level: number; muted: boolean }) {
  const Icon = muted || level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex w-full items-center gap-2.5">
      <Icon size={15} className="shrink-0 text-ink" />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
        <motion.div className="h-full rounded-full bg-white" animate={{ width: `${(muted ? 0 : level) * 100}%` }} transition={{ type: "spring", stiffness: 600, damping: 40 }} />
      </div>
      <span className="tabular w-6 text-right text-[11px] font-semibold text-ink-2">{Math.round((muted ? 0 : level) * 100)}</span>
    </div>
  );
}

function HomeZone() {
  const name = usePet((s) => s.name);
  return (
    <motion.div
      key="home-zone"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.16 }}
      className="absolute inset-0 flex items-center gap-2.5 px-3.5"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-black">
        <HomeIcon size={13} strokeWidth={2.4} />
      </span>
      <span className="flex-1 text-[12px] font-semibold text-ink">Drop to bring {name} home</span>
      <motion.span
        className="h-7 w-7 rounded-full border-2 border-dashed border-[var(--accent)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}

export function Island() {
  const island = useIsland();
  const { mode, hovered, sticky, fullscreenHidden, dragging, active, settingsOpen, holds, petNear } = island;
  const settings = useSettings();
  const activity = useCurrentActivity();
  const enabled = useEnabledModules();
  const ref = useRef<HTMLDivElement>(null);
  const playing = useLive((s) => !!s.media?.playing);

  const expanded = mode === "expanded";
  const peek = mode === "peek";
  const notch = settings.islandStyle === "notch";
  const target = settingsOpen ? SETTINGS_SIZE : (MODULES[active] ?? MODULES.home).size;

  // The collapsed island lives in a small window. On expand we grow the window *first* and
  // only then animate into it, so the first frames never get clipped.
  const [winBig, setWinBig] = useState(() => window.innerWidth > 600);
  useEffect(() => {
    const onResize = () => setWinBig(window.innerWidth > 600);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const open = expanded && winBig;

  // Track the motion phase so each direction gets its own feel, and heavy work waits:
  // the panel mounts just after the island starts growing; big shadows only once settled.
  const [phase, setPhase] = useState<"idle" | "opening" | "open" | "closing">("idle");
  const [showContent, setShowContent] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) setPhase("opening");
    else if (wasOpen.current) setPhase("closing");
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return setShowContent(false);
    const t = setTimeout(() => setShowContent(true), 70);
    return () => clearTimeout(t);
  }, [open]);

  // Minimized (via the button on the pill): a slim bar so whatever is underneath stays usable.
  // Resting the cursor on the bar brings the normal island back.
  const urgent = (activity?.priority ?? 0) >= 95;
  const slim = settings.minimized && !expanded && !dragging && !petNear && !urgent;
  const slimHover = slim && hovered;
  useEffect(() => {
    if (!slimHover) return;
    const t = setTimeout(() => useSettings.getState().set({ minimized: false }), 260);
    return () => clearTimeout(t);
  }, [slimHover]);

  // Warm up the desktop-pet window while the user is near the island, so dragging it out is instant.
  useEffect(() => {
    if (hovered) prepareBuddy();
  }, [hovered]);

  const baseW = activity?.width ?? idleWidth(settings.showClock, settings.showPetInPill);
  let width: number;
  let height: number;
  if (open) [width, height] = [target.w, target.h];
  else if (slim) [width, height] = [Math.round(Math.max(120, baseW * 0.7)) + (slimHover ? 24 : 0), slimHover ? SLIM_H + 6 : SLIM_H];
  else if (petNear) [width, height] = [baseW + 64, IDLE_H + 10];
  else [width, height] = [baseW + (peek ? 18 : 0), IDLE_H + (peek ? 4 : 0)];
  const radius = open ? 30 : slim ? 3 : height / 2;
  const top = notch ? 0 : slim ? 3 : PILL_TOP;

  // ---- hit-rect reporting so only the island captures the mouse ----
  const reportRect = useCallback(() => {
    const el = ref.current;
    if (!el || useIsland.getState().fullscreenHidden) return void api.setHitRect(null);
    const r = el.getBoundingClientRect();
    void api.setHitRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, []);
  const rafRef = useRef(0);
  const onUpdate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(reportRect);
  }, [reportRect]);
  const onAnimationComplete = useCallback(() => {
    reportRect();
    const isOpen = useIsland.getState().mode === "expanded";
    setPhase((p) => (isOpen ? "open" : p === "closing" || p === "open" ? "idle" : p));
  }, [reportRect]);
  useEffect(() => {
    reportRect();
    window.addEventListener("resize", reportRect);
    return () => window.removeEventListener("resize", reportRect);
  }, [reportRect, fullscreenHidden]);

  // ---- hover from the native cursor poller ----
  useEffect(
    () =>
      on("island://hover", (h) => {
        const s = useIsland.getState();
        s.set({ hovered: h, ...(h ? { sticky: false } : {}) });
        if (h && s.mode === "idle") s.set({ mode: "peek" });
        if (!h && s.mode === "peek") s.set({ mode: "idle" });
      }),
    [],
  );

  // expand on hover (optional)
  useEffect(() => {
    if (!settings.expandOnHover || mode !== "peek") return;
    const t = setTimeout(() => useIsland.getState().expand(activity?.opens), settings.hoverDelay);
    return () => clearTimeout(t);
  }, [mode, settings.expandOnHover, settings.hoverDelay, activity?.opens]);

  // auto-collapse after the cursor leaves
  useEffect(() => {
    if (!expanded || hovered || sticky || dragging || holds > 0) return;
    const t = setTimeout(() => {
      if (isEditableTarget(document.activeElement) && document.hasFocus()) return;
      useIsland.getState().collapse();
    }, settings.collapseDelay);
    return () => clearTimeout(t);
  }, [expanded, hovered, sticky, dragging, holds, settings.collapseDelay]);

  useEffect(
    () =>
      on("island://blur", () => {
        const s = useIsland.getState();
        if (s.mode === "expanded" && !s.hovered && !s.dragging && s.holds === 0) s.collapse();
      }),
    [],
  );

  // ---- fullscreen auto-hide ----
  useEffect(
    () =>
      on("island://fullscreen", (fs) => {
        useIsland.getState().set({ fullscreenHidden: fs, ...(fs ? { mode: "idle" } : {}) });
        if (fs) {
          void api.setHitRect(null);
          setTimeout(() => useIsland.getState().fullscreenHidden && void api.setVisible(false), 450);
        } else {
          void api.setVisible(true);
        }
      }),
    [],
  );

  // ---- tray / global shortcut routing ----
  useEffect(
    () =>
      on("island://open", (target) => {
        const s = useIsland.getState();
        if (target === "toggle") return s.mode === "expanded" ? s.collapse() : s.expand(undefined, null, true);
        if (target === "settings") return s.set({ mode: "expanded", settingsOpen: true, sticky: true });
        if (target === "stash:clips") return s.expand("stash", "clips", true);
        if (target === "todos") return s.expand("todos", "new", true);
        if (target === "media:toggle") return void api.media("toggle");
        if (target === "pet:roam") return togglePetOut();
        if (target === "minimize") {
          const st = useSettings.getState();
          if (s.mode === "expanded") s.collapse();
          return st.set({ minimized: !st.minimized });
        }
      }),
    [],
  );

  // ---- drag & drop (files, links from browsers, text) via the native drop target ----
  useEffect(() => {
    if (!isTauri) return;
    // WebView2 creates its child windows asynchronously; register once they exist.
    const t1 = setTimeout(() => void api.initDropTarget(), 400);
    const t2 = setTimeout(() => void api.initDropTarget(), 2500);
    const off = on("island://drag", (p) => {
      const s = useIsland.getState();
      if (p.phase === "enter") {
        if (p.kind === "unknown") return;
        s.set({ dragging: true, dragKind: p.kind, dragCount: p.count });
        if (s.mode !== "expanded" || s.active !== "stash") s.expand("stash", p.kind === "files" ? "files" : p.kind === "link" ? "links" : null);
        play("tick");
      } else if (p.phase === "leave") {
        s.set({ dragging: false });
      } else if (p.phase === "drop") {
        s.set({ dragging: false });
        void handleDrop(p);
      }
    });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      off();
    };
  }, []);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useIsland.getState();
      if (s.mode !== "expanded") return;
      if (e.key === "Escape") {
        if (isEditableTarget(e.target)) return (e.target as HTMLElement).blur();
        return s.collapse();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        return s.set({ settingsOpen: !s.settingsOpen });
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const i = enabled.indexOf(s.active);
        return s.setActive(enabled[(i + (e.shiftKey ? -1 : 1) + enabled.length) % enabled.length]);
      }
      if (e.altKey && !e.ctrlKey && /^Digit\d$/.test(e.code)) {
        e.preventDefault();
        const n = Number(e.code.slice(5));
        const ws = useWorkspaces.getState();
        const target = n === 0 ? ALL : ws.workspaces[n - 1]?.id;
        if (target) {
          ws.setCurrent(target);
          play("tick");
        }
        return;
      }
      if (isEditableTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= enabled.length) s.setActive(enabled[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const onWheel = (e: React.WheelEvent) => {
    if (expanded || slim) return;
    const { level, muted } = useLive.getState().volume;
    const next = Math.min(1, Math.max(0, (muted ? 0 : level) + (e.deltaY < 0 ? 0.04 : -0.04)));
    changeVolume(next);
    showActivity({ id: "volume", priority: 99, ttl: 1300, width: 230, center: <VolumeHud level={next} muted={false} /> });
  };

  // Shadows live on separate layers and only their opacity animates (compositor-only), instead
  // of interpolating box-shadow strings every frame.
  const glow = playing && settings.useArtworkAccent && !open && !slim;
  const fade = { transition: "opacity 260ms cubic-bezier(0.22, 1, 0.36, 1)" } as const;

  return (
    <div className="pointer-events-none flex h-full w-full justify-center">
      <motion.div
        ref={ref}
        onUpdate={onUpdate}
        onAnimationComplete={onAnimationComplete}
        initial={{ y: -60, opacity: 0, width: 120, height: IDLE_H }}
        animate={{
          width,
          height,
          y: fullscreenHidden ? -(height + 24) : top,
          opacity: fullscreenHidden ? 0 : 1,
          borderTopLeftRadius: notch ? 0 : radius,
          borderTopRightRadius: notch ? 0 : radius,
          borderBottomLeftRadius: radius,
          borderBottomRightRadius: radius,
        }}
        transition={settings.reduceMotion ? { duration: 0.12 } : open ? EXPAND : phase === "closing" ? { ...COLLAPSE, delay: 0.05 } : HOVER}
        onClick={() => {
          if (expanded) return;
          if (activity?.onClick) return activity.onClick();
          useIsland.getState().expand(activity?.opens ?? (active || "home"));
        }}
        onWheel={onWheel}
        className={`pointer-events-auto relative overflow-visible bg-island ${expanded ? "" : "clickable"}`}
        style={{ originY: 0 }}
      >
        {/* One constant, modest shadow: nothing swaps or fades in when the morph ends. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: "inherit", boxShadow: "0 10px 28px -10px rgba(0,0,0,0.75)", opacity: slim ? 0 : 1, ...fade }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: "inherit", boxShadow: "0 6px 22px -6px color-mix(in oklab, var(--accent) 60%, transparent)", opacity: glow || petNear || slimHover ? 1 : 0, ...fade }}
        />
        <div className="pointer-events-none absolute inset-0 bg-island" style={{ borderRadius: "inherit", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" }} />

        {notch && (
          <div style={{ opacity: slim ? 0 : 1, ...fade }}>
            <svg className="absolute top-0 -left-[11px] h-[12px] w-[12px]" viewBox="0 0 10 10">
              <path d="M10 0 V10 Q10 0 0 0 Z" fill="var(--color-island)" />
            </svg>
            <svg className="absolute top-0 -right-[11px] h-[12px] w-[12px]" viewBox="0 0 10 10">
              <path d="M0 0 V10 Q0 0 10 0 Z" fill="var(--color-island)" />
            </svg>
          </div>
        )}

        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: open || slim || petNear ? 0 : 1 }}
            transition={open ? { duration: 0.12, ease: "easeOut" } : { duration: 0.22, delay: phase === "closing" ? 0.16 : 0, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: open || slim ? "none" : "auto" }}
          >
            <CollapsedContent activity={activity} peek={peek} />
          </motion.div>

          {/* Live hint while slim: a thin accent line when something is playing/running. */}
          <div
            className="pointer-events-none absolute inset-x-3 bottom-[1.5px] h-[2px] rounded-full"
            style={{ background: "var(--accent)", opacity: slim && activity ? 0.9 : 0, ...fade }}
          />
          <div
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{ opacity: slimHover ? 1 : 0, transition: "opacity 180ms ease-out" }}
          >
            <span className="h-[3px] w-8 rounded-full bg-white/40" />
          </div>

          <AnimatePresence>{petNear && !open && <HomeZone />}</AnimatePresence>

          <AnimatePresence>
            {open && showContent && (
              <motion.div
                key="expanded"
                className="absolute inset-0"
                // Opacity + a tiny slide only: scaling text makes Chromium re-raster it when the
                // animation ends, which shows up as a flicker on the last frame.
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
              >
                <ExpandedContent width={target.w} height={target.h} />
              </motion.div>
            )}
          </AnimatePresence>
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)", opacity: open ? 1 : 0, ...fade }}
          />
        </div>
      </motion.div>
    </div>
  );
}

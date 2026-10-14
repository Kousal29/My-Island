import { motion } from "motion/react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
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
import { togglePetOut } from "../state/buddy";
import { toast } from "../state/toast";
import { CollapsedContent, IDLE_H, idleWidth, useCurrentActivity } from "./Collapsed";
import { ExpandedContent, useEnabledModules } from "./Expanded";

async function handleDrop(p: DragPayload) {
  const stash = useStash.getState();
  const urlLike = (t: string) => /^(https?:\/\/|www\.)\S+$/i.test(t.trim());
  if (p.kind === "files" && p.files.length) {
    const n = await stash.addFiles(p.files);
    toast(n ? `Stashed ${n} file${n > 1 ? "s" : ""} 📌` : "Already in your stash");
  } else if (p.kind === "link" && p.url) {
    stash.addLink(p.url);
    toast("Link saved 🔗");
  } else if (p.text) {
    if (urlLike(p.text)) {
      stash.addLink(p.text.trim());
      toast("Link saved 🔗");
    } else {
      const firstLine = p.text.trim().split("\n")[0].slice(0, 60);
      stash.addNote(p.text, firstLine.length < p.text.trim().length ? firstLine : "");
      toast("Saved as a doc 📝");
    }
  } else {
    return;
  }
  play("success");
}

const ISLAND_SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.85 } as const;
const PILL_TOP = 8;

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

export function Island() {
  const island = useIsland();
  const { mode, hovered, sticky, fullscreenHidden, dragging, active, settingsOpen, holds } = island;
  const settings = useSettings();
  const activity = useCurrentActivity();
  const enabled = useEnabledModules();
  const ref = useRef<HTMLDivElement>(null);
  const playing = useLive((s) => !!s.media?.playing);

  const expanded = mode === "expanded";
  const peek = mode === "peek";
  const notch = settings.islandStyle === "notch";
  const target = settingsOpen ? SETTINGS_SIZE : (MODULES[active] ?? MODULES.home).size;

  const baseW = activity?.width ?? idleWidth(settings.showClock, settings.showPetInPill);
  const width = expanded ? target.w : baseW + (peek ? 18 : 0);
  const height = expanded ? target.h : IDLE_H + (peek ? 4 : 0);
  const radius = expanded ? 30 : height / 2;
  const top = notch ? 0 : PILL_TOP;

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
  useEffect(() => {
    reportRect();
    window.addEventListener("resize", reportRect);
    return () => window.removeEventListener("resize", reportRect);
  }, [reportRect, fullscreenHidden]);

  // Big window only while expanded; the collapsed pill lives in a small one (less to composite).
  useEffect(() => {
    if (expanded) return void api.setCompact(false);
    const t = setTimeout(() => void api.setCompact(true), 520);
    return () => clearTimeout(t);
  }, [expanded]);

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
    if (expanded) return;
    const { level, muted } = useLive.getState().volume;
    const next = Math.min(1, Math.max(0, (muted ? 0 : level) + (e.deltaY < 0 ? 0.04 : -0.04)));
    changeVolume(next);
    showActivity({ id: "volume", priority: 99, ttl: 1300, width: 230, center: <VolumeHud level={next} muted={false} /> });
  };

  const shadow = expanded
    ? "0 24px 60px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)"
    : playing && settings.useArtworkAccent
      ? "0 6px 20px -6px color-mix(in oklab, var(--accent) 55%, transparent), 0 0 0 1px rgba(255,255,255,0.05)"
      : `0 6px 18px -6px rgba(0,0,0,${peek ? 0.8 : 0.55}), 0 0 0 1px rgba(255,255,255,0.04)`;

  return (
    <div className="pointer-events-none flex h-full w-full justify-center">
      <motion.div
        ref={ref}
        onUpdate={onUpdate}
        onAnimationComplete={reportRect}
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
          boxShadow: shadow,
        }}
        transition={settings.reduceMotion ? { duration: 0.12 } : ISLAND_SPRING}
        onClick={() => {
          if (!expanded) useIsland.getState().expand(activity?.opens ?? (active || "home"));
        }}
        onWheel={onWheel}
        className={`pointer-events-auto relative overflow-visible bg-island ${expanded ? "" : "clickable"}`}
        style={{ originY: 0 }}
      >
        {notch && (
          <>
            <svg className="absolute top-0 -left-[11px] h-[12px] w-[12px]" viewBox="0 0 10 10">
              <path d="M10 0 V10 Q10 0 0 0 Z" fill="var(--color-island)" />
            </svg>
            <svg className="absolute top-0 -right-[11px] h-[12px] w-[12px]" viewBox="0 0 10 10">
              <path d="M0 0 V10 Q0 0 10 0 Z" fill="var(--color-island)" />
            </svg>
          </>
        )}
        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: expanded ? 0 : 1, scale: expanded ? 0.85 : 1, filter: expanded ? "blur(8px)" : "blur(0px)" }}
            transition={{ duration: 0.18 }}
            style={{ pointerEvents: expanded ? "none" : "auto" }}
          >
            <CollapsedContent activity={activity} peek={peek} />
          </motion.div>
          {expanded && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.26, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <ExpandedContent width={target.w} height={target.h} />
            </motion.div>
          )}
          <motion.div
            className="pointer-events-none absolute inset-x-6 top-0 h-px"
            animate={{ opacity: expanded ? 1 : 0 }}
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
          />
        </div>
      </motion.div>
    </div>
  );
}

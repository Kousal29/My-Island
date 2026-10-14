import { motion } from "motion/react";
import { BatteryCharging, BatteryWarning, Check, ClipboardCheck, Files, PartyPopper, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { Island } from "./island/Island";
import { api, on } from "./lib/bridge";
import { bus } from "./lib/bus";
import { extractAccent } from "./lib/color";
import { play } from "./lib/sound";
import { Pet } from "./pet/Pet";
import { showActivity } from "./state/activities";
import { useIsland } from "./state/island";
import { startLiveFeeds, useLive } from "./state/live";
import { hydratePet, react, startPetBrain, usePet } from "./state/pet";
import { ACCENTS, hydrateSettings, useSettings } from "./state/settings";
import { hydrateStash, useStash } from "./state/stash";
import { hydrateTimer, startTimerLoop } from "./state/timer";
import { hydrateTodos } from "./state/todos";
import { hydrateWorkspaces } from "./state/workspaces";
import { toast } from "./state/toast";
import { BatteryGlyph } from "./modules/stats";
import { startBuddyBridge } from "./state/buddy";

const pop = { initial: { scale: 0, rotate: -30 }, animate: { scale: 1, rotate: 0 }, transition: { type: "spring", stiffness: 600, damping: 14 } } as const;

function useAccent() {
  const accentName = useSettings((s) => s.accent);
  const useArt = useSettings((s) => s.useArtworkAccent);
  const art = useLive((s) => (s.media?.playing ? s.media.artwork : null));
  const [artAccent, setArtAccent] = useState<string | null>(null);
  useEffect(() => {
    if (!art || !useArt) return setArtAccent(null);
    let alive = true;
    void extractAccent(art).then((c) => alive && setArtAccent(c));
    return () => {
      alive = false;
    };
  }, [art, useArt]);
  const accent = artAccent ?? ACCENTS[accentName];
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);
}

function useBackendSync() {
  const { autohideFullscreen, clipboardCapture, monitor, reduceMotion } = useSettings();
  useEffect(() => void api.setAutohideFullscreen(autohideFullscreen), [autohideFullscreen]);
  useEffect(() => void api.setClipboardCapture(clipboardCapture), [clipboardCapture]);
  useEffect(() => void api.setMonitor(monitor), [monitor]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);
}

/** Routes app events into short-lived collapsed-island activities. */
function wireActivities() {
  const offs = [
    bus.on("todo:completed", ({ title }) =>
      showActivity({
        id: "todo-done",
        priority: 75,
        opens: "todos",
        ttl: 2200,
        width: 270,
        left: (
          <motion.span {...pop} className="grid h-5 w-5 place-items-center rounded-full bg-good text-black">
            <Check size={12} strokeWidth={3.5} />
          </motion.span>
        ),
        center: <span className="max-w-[170px] truncate text-[12px] font-medium text-ink-2 line-through decoration-ink-3">{title}</span>,
        right: <Pet size={30} variant="head" interactive={false} showBubble={false} still />,
      }),
    ),
    bus.on("timer:done", ({ label }) =>
      showActivity({
        id: "timer-done",
        priority: 95,
        opens: "timer",
        ttl: 7000,
        width: 280,
        left: (
          <motion.span animate={{ rotate: [0, -18, 18, -12, 12, 0] }} transition={{ duration: 0.7, repeat: 4 }} className="text-[var(--accent-ink)]">
            <TimerReset size={17} />
          </motion.span>
        ),
        center: <span className="text-[12px] font-semibold">{label} complete</span>,
        right: <span className="text-[11px] text-ink-3">tap to continue</span>,
      }),
    ),
    bus.on("battery:plugged", ({ percent }) => {
      const b = useLive.getState().stats?.battery;
      showActivity({
        id: "battery",
        priority: 80,
        ttl: 2600,
        width: 230,
        left: <BatteryCharging size={17} className="text-good" />,
        center: <span className="text-[12px] font-medium text-ink-2">Charging</span>,
        right: b ? (
          <span className="flex items-center gap-1.5">
            <span className="tabular text-[12px] font-semibold text-good">{percent}%</span>
            <BatteryGlyph b={{ ...b, charging: true }} width={22} />
          </span>
        ) : null,
      });
    }),
    bus.on("battery:low", ({ percent }) =>
      showActivity({
        id: "battery",
        priority: 85,
        ttl: 5000,
        width: 240,
        left: (
          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }}>
            <BatteryWarning size={17} className="text-bad" />
          </motion.span>
        ),
        center: <span className="text-[12px] font-medium text-ink-2">Low battery</span>,
        right: <span className="tabular text-[12px] font-semibold text-bad">{percent}%</span>,
      }),
    ),
    bus.on("pet:levelup", ({ level }) =>
      showActivity({
        id: "levelup",
        priority: 90,
        ttl: 3200,
        width: 280,
        left: (
          <motion.span {...pop} className="text-warn">
            <PartyPopper size={16} />
          </motion.span>
        ),
        center: (
          <span className="text-[12px] font-semibold">
            {usePet.getState().name} reached level {level}!
          </span>
        ),
        right: <Pet size={30} variant="head" interactive={false} showBubble={false} still />,
      }),
    ),
  ];
  return () => offs.forEach((f) => f());
}

function wireClipboard() {
  return on("clipboard://changed", ({ text, files }) => {
    if (text) {
      const item = useStash.getState().addClip(text);
      if (!item) return;
      bus.emit("clip:copied", { text });
      showActivity({
        id: "clip",
        priority: 70,
        opens: "stash",
        ttl: 1500,
        width: 250,
        left: (
          <motion.span {...pop}>
            <ClipboardCheck size={15} className="text-[var(--accent-ink)]" />
          </motion.span>
        ),
        center: <span className="max-w-[160px] truncate text-[11.5px] text-ink-3">{text.trim().replace(/\s+/g, " ")}</span>,
        right: <span className="text-[10.5px] font-semibold text-ink-2">Saved</span>,
      });
    } else if (files.length) {
      showActivity({
        id: "clip-files",
        priority: 70,
        ttl: 4000,
        width: 270,
        left: <Files size={15} className="text-[var(--accent-ink)]" />,
        center: (
          <span className="text-[11.5px] text-ink-2">
            {files.length} file{files.length > 1 ? "s" : ""} copied
          </span>
        ),
        right: (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const n = await useStash.getState().addFiles(files);
              toast(n ? `Stashed ${n} file${n > 1 ? "s" : ""}` : "Already stashed");
              play("pop");
            }}
            className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10.5px] font-semibold text-black"
          >
            Stash
          </button>
        ),
      });
    }
  });
}

export default function App() {
  const [ready, setReady] = useState(false);
  useAccent();
  useBackendSync();

  useEffect(() => {
    let cleanup: (() => void)[] = [];
    let cancelled = false;
    void Promise.allSettled([hydrateWorkspaces(), hydrateSettings(), hydrateTodos(), hydrateStash(), hydratePet(), hydrateTimer()]).then(() => {
      if (cancelled) return;
      cleanup = [startLiveFeeds(), startPetBrain(), startTimerLoop(), wireActivities(), wireClipboard(), startBuddyBridge()];
      setReady(true);
      if (!useSettings.getState().onboarded) {
        setTimeout(() => {
          useIsland.getState().expand("home", null, true);
          react("excited", 3500, `Hi! I'm ${usePet.getState().name} 👋`);
          useSettings.getState().set({ onboarded: true });
          toast("Tip: Ctrl+Alt+Space opens the island anytime");
        }, 900);
      }
    });
    return () => {
      cancelled = true;
      cleanup.forEach((f) => f());
    };
  }, []);

  if (!ready) return null;
  return <Island />;
}

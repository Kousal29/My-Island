import { AnimatePresence, motion } from "motion/react";
import { Music2, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type MediaState } from "../../lib/bridge";
import { formatDuration } from "../../lib/util";
import { changeVolume, livePosition, useLive } from "../../state/live";
import { Empty, Equalizer, IconButton, Marquee, Slider, bouncy } from "../../ui/primitives";
import type { IslandModule } from "../types";

export function appName(appId: string) {
  const id = appId.toLowerCase();
  if (id.includes("spotify")) return "Spotify";
  if (id.includes("chrome")) return "Chrome";
  if (id.includes("msedge") || id.includes("edge")) return "Edge";
  if (id.includes("firefox")) return "Firefox";
  if (id.includes("zunemusic") || id.includes("media player")) return "Media Player";
  if (id.includes("applemusic") || id.includes("apple")) return "Apple Music";
  if (id.includes("vlc")) return "VLC";
  if (id.includes("brave")) return "Brave";
  if (id.includes("opera")) return "Opera";
  if (id.includes("youtube")) return "YouTube Music";
  if (id.includes("tidal")) return "TIDAL";
  if (id.includes("deezer")) return "Deezer";
  const tail = appId.split(/[\\/!]/).pop() ?? appId;
  return tail.replace(/\.exe$/i, "") || "Media";
}

export function useMediaProgress(m: MediaState | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!m?.playing) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [m?.playing, m?.sampledAt]);
  if (!m) return { pos: 0, pct: 0 };
  const pos = livePosition(m, now);
  return { pos, pct: m.durationMs ? pos / m.durationMs : 0 };
}

export function Artwork({ src, size, radius = 12, playing }: { src: string | null; size: number; radius?: number; playing?: boolean }) {
  return (
    <motion.div
      animate={{ scale: playing === false ? 0.92 : 1 }}
      transition={bouncy}
      className="relative shrink-0 overflow-hidden bg-white/8"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <AnimatePresence mode="popLayout">
        {src ? (
          <motion.img
            key={src.slice(-64)}
            src={src}
            draggable={false}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <motion.div key="ph" className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[var(--accent)]/50 to-white/5 text-white/80">
            <Music2 size={size * 0.42} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10 ring-inset" style={{ borderRadius: radius }} />
    </motion.div>
  );
}

function Seek({ m }: { m: MediaState }) {
  const { pos, pct } = useMediaProgress(m);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? pct;
  return (
    <div className="flex items-center gap-2.5">
      <span className="tabular w-9 text-right text-[10.5px] text-ink-3">{formatDuration(scrub !== null ? scrub * m.durationMs : pos)}</span>
      {m.canSeek ? (
        <div
          className="flex-1"
          onPointerUp={() => {
            if (scrub !== null) void api.media("seek", scrub * m.durationMs);
            setTimeout(() => setScrub(null), 300);
          }}
        >
          <Slider value={shown} onChange={setScrub} color="var(--accent)" label="Seek" />
        </div>
      ) : (
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12">
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${shown * 100}%` }} />
        </div>
      )}
      <span className="tabular w-9 text-[10.5px] text-ink-3">{m.durationMs ? `-${formatDuration(m.durationMs - pos)}` : "--:--"}</span>
    </div>
  );
}

function VolumeRow() {
  const vol = useLive((s) => s.volume);
  const Icon = vol.muted || vol.level === 0 ? VolumeX : vol.level < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={vol.muted ? "Unmute" : "Mute"}
        size="sm"
        onClick={() => {
          const muted = !vol.muted;
          useLive.setState({ volume: { ...vol, muted } });
          void api.setMute(muted);
        }}
      >
        <Icon size={15} />
      </IconButton>
      <Slider className="w-full" value={vol.muted ? 0 : vol.level} onChange={changeVolume} color="rgb(255 255 255 / 0.85)" label="Volume" />
      <span className="tabular w-7 text-right text-[10.5px] text-ink-3">{Math.round((vol.muted ? 0 : vol.level) * 100)}</span>
    </div>
  );
}

export function Transport({ m, size = "md" }: { m: MediaState; size?: "sm" | "md" }) {
  const big = size === "md";
  return (
    <div className="flex items-center justify-center gap-1">
      <IconButton label="Previous" size={big ? "lg" : "sm"} disabled={!m.canPrev} onClick={() => void api.media("prev")}>
        <SkipBack size={big ? 20 : 14} fill="currentColor" />
      </IconButton>
      <IconButton label={m.playing ? "Pause" : "Play"} size={big ? "lg" : "sm"} tone="solid" className={big ? "!h-12 !w-12" : ""} onClick={() => void api.media("toggle")}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={String(m.playing)} initial={{ scale: 0.4, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }} transition={bouncy}>
            {m.playing ? <Pause size={big ? 22 : 14} fill="currentColor" /> : <Play size={big ? 22 : 14} fill="currentColor" className="translate-x-[1px]" />}
          </motion.span>
        </AnimatePresence>
      </IconButton>
      <IconButton label="Next" size={big ? "lg" : "sm"} disabled={!m.canNext} onClick={() => void api.media("next")}>
        <SkipForward size={big ? 20 : 14} fill="currentColor" />
      </IconButton>
    </div>
  );
}

function MediaView() {
  const m = useLive((s) => s.media);
  if (!m) {
    return (
      <Empty icon="🎧" title="Nothing playing" hint="Play something in Spotify, your browser, or any app that shows in the Windows media flyout.">
        <VolumeRowWrap />
      </Empty>
    );
  }
  return (
    <div className="relative flex h-full gap-5 px-1 pt-1">
      <div
        className="pointer-events-none absolute -top-10 -left-10 h-56 w-56 rounded-full blur-3xl transition-opacity duration-700"
        style={{ background: "var(--accent)", opacity: m.playing ? 0.32 : 0.12 }}
      />
      <div className="relative">
        <Artwork src={m.artwork} size={148} radius={22} playing={m.playing} />
        <div className="absolute -right-2 -bottom-2 rounded-full bg-island px-2 py-1 ring-1 ring-white/10">
          <Equalizer playing={m.playing} bars={4} height={12} />
        </div>
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col justify-between py-1">
        <div className="min-w-0">
          <div className="mb-1 text-[10.5px] font-semibold tracking-[0.08em] text-[var(--accent-ink)] uppercase">{appName(m.appId)}</div>
          <Marquee text={m.title || "Unknown title"} className="font-display text-[19px] leading-tight font-semibold" />
          <Marquee text={[m.artist, m.album].filter(Boolean).join(" — ") || "Unknown artist"} className="mt-0.5 text-[13px] text-ink-2" />
        </div>
        <Seek m={m} />
        <div className="flex items-center gap-4">
          <Transport m={m} />
          <div className="flex-1">
            <VolumeRow />
          </div>
        </div>
      </div>
    </div>
  );
}

function VolumeRowWrap() {
  return (
    <div className="mt-3 w-56">
      <VolumeRow />
    </div>
  );
}

function useMediaActivity() {
  const m = useLive((s) => s.media);
  if (!m || (!m.playing && !m.title)) return null;
  return {
    priority: m.playing ? 40 : 10,
    width: m.playing ? 290 : 250,
    opens: "media",
    left: <Artwork src={m.artwork} size={22} radius={7} playing={m.playing} />,
    center: <MiniTitle m={m} />,
    right: <Equalizer playing={m.playing} bars={4} height={13} />,
  };
}

function MiniTitle({ m }: { m: MediaState }) {
  return <Marquee text={m.title} className="max-w-[170px] text-[12px] font-medium text-ink-2" />;
}

export const mediaModule: IslandModule = {
  id: "media",
  title: "Now Playing",
  icon: Music2,
  size: { w: 580, h: 236 },
  View: MediaView,
  useActivity: useMediaActivity,
  description: "Track info, artwork, seek & transport for any app in the Windows media flyout.",
};

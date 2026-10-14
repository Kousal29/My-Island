import { motion, type TargetAndTransition, type Transition } from "motion/react";
import { useEffect, useState } from "react";
import type { Accessory, Pose } from "../state/pet";
import type { PetKind } from "../state/settings";

export interface Palette { body: string; belly: string; ear: string; dark: string; spot?: string }

interface Props {
  kind: PetKind;
  pose: Pose;
  palette: Palette;
  accessory: Accessory;
  look?: { x: number; y: number };
  variant?: "full" | "head";
  /** No looping motion (only blinks) — used in the collapsed island so idle costs ~0 CPU. */
  still?: boolean;
}

const INK = "#1f1a26";
const BLUSH = "#ff8fab";
const loop = (duration: number, extra: Transition = {}): Transition => ({ duration, repeat: Infinity, ease: "easeInOut", ...extra });

function useBlink(enabled: boolean) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setClosed(true);
        setTimeout(() => {
          setClosed(false);
          // Occasional double-blink feels alive.
          if (Math.random() < 0.25) setTimeout(() => { setClosed(true); setTimeout(() => setClosed(false), 110); }, 160);
          schedule();
        }, 120);
      }, 2200 + Math.random() * 4200);
    };
    schedule();
    return () => clearTimeout(t);
  }, [enabled]);
  return closed;
}

const STILL = { animate: { rotate: 0, y: 0, x: 0, scaleY: 1, scaleX: 1 }, transition: { duration: 0.3 } };

function headMotion(pose: Pose): { animate: TargetAndTransition; transition: Transition } {
  switch (pose) {
    case "dance": return { animate: { rotate: [-9, 9, -9], y: [0, -2, 0, -2, 0] }, transition: loop(0.9) };
    case "curious": return { animate: { rotate: 13, y: -1 }, transition: { type: "spring", stiffness: 260, damping: 12 } };
    case "love": return { animate: { rotate: [-6, 6, -6] }, transition: loop(1.1) };
    case "eat": return { animate: { y: [6, 9, 6], rotate: 0 }, transition: loop(0.42) };
    case "sleep": return { animate: { y: 5, rotate: -8 }, transition: { duration: 1.2, ease: "easeInOut" } };
    case "sad": return { animate: { y: 3, rotate: -4 }, transition: { duration: 0.6 } };
    case "yawn": return { animate: { y: [-1, -3, -1], rotate: [0, -4, 0] }, transition: { duration: 1.6 } };
    case "excited": return { animate: { rotate: [-4, 4, -4] }, transition: loop(0.4) };
    case "walk": return { animate: { y: [0, -1.5, 0], rotate: [-2, 2, -2] }, transition: loop(0.5) };
    case "held": return { animate: { rotate: [-7, 7, -7], y: 0 }, transition: loop(0.8) };
    default: return { animate: { rotate: [0, 2, 0, -1.5, 0], y: 0 }, transition: loop(6) };
  }
}

function bodyMotion(pose: Pose): { animate: TargetAndTransition; transition: Transition } {
  switch (pose) {
    case "happy": return { animate: { y: [0, -9, 0], scaleY: [1, 1.04, 0.96, 1] }, transition: loop(0.55) };
    case "excited": return { animate: { y: [0, -14, 0], scaleY: [1, 1.06, 0.94, 1] }, transition: loop(0.5) };
    case "dance": return { animate: { x: [-3, 3, -3], rotate: [-4, 4, -4] }, transition: loop(0.9) };
    case "sleep": return { animate: { scaleY: [1, 1.035, 1], scaleX: [1, 1.015, 1] }, transition: loop(3.6) };
    case "yawn": return { animate: { scaleY: [1, 1.08, 1] }, transition: { duration: 1.6 } };
    case "walk": return { animate: { y: [0, -2.5, 0] }, transition: loop(0.25) };
    case "held": return { animate: { rotate: [-9, 9, -9], scaleY: 1.06, y: 0 }, transition: loop(0.9) };
    default: return { animate: { scaleY: [1, 1.025, 1], y: 0, x: 0, rotate: 0 }, transition: loop(3.2) };
  }
}

function Eyes({ pose, palette, look, blink, still }: { pose: Pose; palette: Palette; look: { x: number; y: number }; blink: boolean; still?: boolean }) {
  const lx = 48, rx = 72, ey = 40;
  if (pose === "sleep" || pose === "yawn") {
    return (
      <g stroke={INK} strokeWidth={2.3} strokeLinecap="round" fill="none">
        <path d={`M${lx - 4.5} ${ey} Q${lx} ${ey + 4} ${lx + 4.5} ${ey}`} />
        <path d={`M${rx - 4.5} ${ey} Q${rx} ${ey + 4} ${rx + 4.5} ${ey}`} />
      </g>
    );
  }
  if (pose === "happy" || pose === "excited" || pose === "dance") {
    return (
      <g stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none">
        <path d={`M${lx - 4.5} ${ey + 1.5} Q${lx} ${ey - 4} ${lx + 4.5} ${ey + 1.5}`} />
        <path d={`M${rx - 4.5} ${ey + 1.5} Q${rx} ${ey - 4} ${rx + 4.5} ${ey + 1.5}`} />
      </g>
    );
  }
  if (pose === "love") {
    const heart = (cx: number) => `M${cx} ${ey + 4} C ${cx - 7} ${ey - 1}, ${cx - 4} ${ey - 7}, ${cx} ${ey - 3} C ${cx + 4} ${ey - 7}, ${cx + 7} ${ey - 1}, ${cx} ${ey + 4} Z`;
    return (
      <motion.g animate={still ? {} : { scale: [1, 1.15, 1] }} transition={loop(0.6)} style={{ originX: "50%", originY: "50%" }} fill="#ff4d7e">
        <path d={heart(lx)} />
        <path d={heart(rx)} />
      </motion.g>
    );
  }
  const big = pose === "curious" || pose === "held";
  const sad = pose === "sad";
  const ox = look.x * 1.6, oy = look.y * 1.3;
  const ry = big ? 5.8 : sad ? 4.2 : 5.2;
  return (
    <g>
      {[lx, rx].map((cx) => (
        <motion.g key={cx} animate={{ scaleY: blink ? 0.08 : 1 }} transition={{ duration: 0.07 }} style={{ originX: "50%", originY: "50%" }}>
          <ellipse cx={cx + ox} cy={ey + oy} rx={big ? 4.8 : 4.3} ry={ry} fill={INK} />
          <circle cx={cx + ox + 1.5} cy={ey + oy - 2} r={1.7} fill="#fff" />
          <circle cx={cx + ox - 1.3} cy={ey + oy + 2} r={0.8} fill="#fff" opacity={0.8} />
        </motion.g>
      ))}
      {sad && (
        <g stroke={palette.dark} strokeWidth={1.6} strokeLinecap="round">
          <path d={`M${lx - 5} ${ey - 8} L${lx + 3} ${ey - 10}`} />
          <path d={`M${rx + 5} ${ey - 8} L${rx - 3} ${ey - 10}`} />
        </g>
      )}
    </g>
  );
}

function Mouth({ kind, pose, still }: { kind: PetKind; pose: Pose; still?: boolean }) {
  const open = pose === "yawn" || pose === "excited" || pose === "eat";
  if (open) {
    const ry = pose === "yawn" ? 4.5 : pose === "eat" ? 2.6 : 3.4;
    return (
      <motion.g animate={pose === "eat" && !still ? { scaleY: [1, 0.4, 1] } : {}} transition={loop(0.42)} style={{ originX: "50%", originY: "0%" }}>
        <ellipse cx={60} cy={53 + ry / 2} rx={3.4} ry={ry} fill="#7a2638" />
        <ellipse cx={60} cy={54.5 + ry} rx={2.2} ry={1.4} fill="#ff7d96" />
      </motion.g>
    );
  }
  const tongue = kind === "dog" && (pose === "happy" || pose === "dance" || pose === "love" || pose === "walk");
  return (
    <g>
      {tongue && (
        <motion.path d="M57.2 53 Q60 61 62.8 53 Z" fill="#ff7d96" animate={still ? {} : { scaleY: [1, 1.15, 1] }} transition={loop(0.5)} style={{ originX: "50%", originY: "0%" }} />
      )}
      <path
        d={kind === "dog" ? "M60 49.8 V52 M60 52 Q57 55.2 54 52.6 M60 52 Q63 55.2 66 52.6" : pose === "sad" ? "M56 53 Q60 50.5 64 53" : "M60 49.5 Q57.5 52.8 55 50.8 M60 49.5 Q62.5 52.8 65 50.8"}
        stroke={INK}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function Accessories({ which, kind }: { which: Accessory; kind: PetKind }) {
  switch (which) {
    case "bow": {
      const [x, y] = kind === "cat" ? [76, 19] : [70, 15];
      return (
        <g transform={`translate(${x} ${y}) rotate(18)`}>
          <path d="M0 0 L-9 -6 Q-11 0 -9 6 Z" fill="#ff5d8f" />
          <path d="M0 0 L9 -6 Q11 0 9 6 Z" fill="#ff5d8f" />
          <circle r={3} fill="#ff86aa" />
        </g>
      );
    }
    case "scarf":
      return (
        <g>
          <path d="M38 61 Q60 72 82 61 L82 67 Q60 78 38 67 Z" fill="#ff5e5e" />
          <path d="M70 66 L76 82 L69 81 L65 68 Z" fill="#e94a4a" />
          <path d="M44 64.5 Q60 72 76 64.5" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.4} fill="none" strokeDasharray="2 3" />
        </g>
      );
    case "glasses":
      return (
        <g stroke="#26222e" strokeWidth={2} fill="rgba(140,200,255,0.18)">
          <circle cx={48} cy={40} r={8.2} />
          <circle cx={72} cy={40} r={8.2} />
          <path d="M56 39 Q60 36.5 64 39" fill="none" />
        </g>
      );
    case "party":
      return (
        <g transform="translate(46 2) rotate(-16)">
          <path d="M0 22 L9 -4 L18 22 Z" fill="#8b7bff" />
          <path d="M3 13 L15 13 M5.5 6 L12.5 6" stroke="#ffd24a" strokeWidth={2.2} />
          <circle cx={9} cy={-5} r={3.4} fill="#ffd24a" />
        </g>
      );
    case "crown":
      return (
        <g transform="translate(47 4)">
          <path d="M0 14 L2 2 L8 9 L13 0 L18 9 L24 2 L26 14 Z" fill="#ffd24a" stroke="#e0a91c" strokeWidth={1.2} strokeLinejoin="round" />
          <circle cx={13} cy={10} r={2} fill="#ff5d8f" />
        </g>
      );
    default:
      return null;
  }
}

export function PetSvg({ kind, pose, palette, accessory, look = { x: 0, y: 0 }, variant = "full", still = false }: Props) {
  const blink = useBlink(pose !== "sleep" && pose !== "love" && pose !== "happy");
  const head = still ? STILL : headMotion(pose);
  const body = still ? STILL : bodyMotion(pose);
  const earDroop = pose === "sad" || pose === "sleep";
  const earPerk = pose === "curious" || pose === "excited";
  const viewBox = variant === "head" ? "14 0 92 70" : "0 0 120 100";

  const headGroup = (
    <motion.g animate={head.animate} transition={head.transition} style={{ originX: "50%", originY: "90%" }}>
      {kind === "cat" ? (
        <>
          {/* ears */}
          <motion.g
            animate={{ rotate: earDroop ? -16 : earPerk ? 6 : still ? 0 : [0, 0, -9, 0, 0] }}
            transition={earDroop || earPerk || still ? { type: "spring", stiffness: 200, damping: 12 } : loop(7, { times: [0, 0.8, 0.84, 0.9, 1] })}
            style={{ originX: "70%", originY: "100%" }}
          >
            <path d="M33 31 L37 7 L55 21 Z" fill={palette.body} stroke={palette.body} strokeWidth={5} strokeLinejoin="round" />
            <path d="M38.5 26 L40 14 L49.5 21.5 Z" fill={palette.ear} strokeLinejoin="round" />
          </motion.g>
          <motion.g
            animate={{ rotate: earDroop ? 16 : earPerk ? -6 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 12 }}
            style={{ originX: "30%", originY: "100%" }}
          >
            <path d="M87 31 L83 7 L65 21 Z" fill={palette.body} stroke={palette.body} strokeWidth={5} strokeLinejoin="round" />
            <path d="M81.5 26 L80 14 L70.5 21.5 Z" fill={palette.ear} />
          </motion.g>
        </>
      ) : (
        <>
          <motion.path
            d="M35 24 C 21 24, 17 47, 25 57 C 31 63, 39 52, 42 32 Z"
            fill={palette.ear}
            animate={{ rotate: earDroop ? 8 : earPerk ? -14 : !still && (pose === "walk" || pose === "happy") ? [-6, 6, -6] : 0 }}
            transition={!still && (pose === "walk" || pose === "happy") ? loop(0.5) : { type: "spring", stiffness: 200, damping: 10 }}
            style={{ originX: "80%", originY: "10%" }}
          />
          <motion.path
            d="M85 24 C 99 24, 103 47, 95 57 C 89 63, 81 52, 78 32 Z"
            fill={palette.ear}
            animate={{ rotate: earDroop ? -8 : earPerk ? 14 : !still && (pose === "walk" || pose === "happy") ? [6, -6, 6] : 0 }}
            transition={!still && (pose === "walk" || pose === "happy") ? loop(0.5) : { type: "spring", stiffness: 200, damping: 10 }}
            style={{ originX: "20%", originY: "10%" }}
          />
        </>
      )}
      {/* head */}
      <ellipse cx={60} cy={40} rx={30} ry={26} fill={palette.body} />
      {kind === "cat" && palette.spot && (
        <g stroke={palette.spot} strokeWidth={2.6} strokeLinecap="round">
          <path d="M60 15.5 V21.5" />
          <path d="M53 17 L55 22" />
          <path d="M67 17 L65 22" />
        </g>
      )}
      {kind === "cat" && palette.spot && palette.belly === "#ffffff" && (
        <path d="M70 20 C 82 18, 90 30, 88 40 C 80 38, 72 30, 70 20 Z" fill={palette.spot} opacity={0.9} />
      )}
      {kind === "dog" && <path d="M60 17 C 55.5 28, 55.5 37, 60 45 C 64.5 37, 64.5 28, 60 17 Z" fill={palette.belly} opacity={0.95} />}
      {/* muzzle */}
      <ellipse cx={60} cy={kind === "dog" ? 51 : 50.5} rx={kind === "dog" ? 13 : 10.5} ry={kind === "dog" ? 9 : 7.2} fill={palette.belly} />
      {/* blush */}
      <motion.g animate={{ opacity: pose === "love" || pose === "happy" ? 0.85 : 0.5 }}>
        <ellipse cx={41} cy={50} rx={4.6} ry={2.7} fill={BLUSH} />
        <ellipse cx={79} cy={50} rx={4.6} ry={2.7} fill={BLUSH} />
      </motion.g>
      <Eyes pose={pose} palette={palette} look={look} blink={blink} still={still} />
      {/* nose */}
      {kind === "cat" ? (
        <path d="M57.3 45.8 Q60 44.8 62.7 45.8 Q61.2 48.6 60 49 Q58.8 48.6 57.3 45.8 Z" fill="#ff8fa3" />
      ) : (
        <g>
          <ellipse cx={60} cy={46.5} rx={4.8} ry={3.3} fill="#2a1f22" />
          <ellipse cx={58.6} cy={45.4} rx={1.5} ry={0.9} fill="#fff" opacity={0.55} />
        </g>
      )}
      <Mouth kind={kind} pose={pose} still={still} />
      {kind === "cat" && (
        <g stroke={palette.dark} strokeOpacity={0.4} strokeWidth={1.1} strokeLinecap="round">
          <path d="M40 48 L27 46" />
          <path d="M40 51.5 L27.5 53.5" />
          <path d="M80 48 L93 46" />
          <path d="M80 51.5 L92.5 53.5" />
        </g>
      )}
      <Accessories which={accessory === "scarf" ? "none" : accessory} kind={kind} />
    </motion.g>
  );

  if (variant === "head") {
    return (
      <svg viewBox={viewBox} className="h-full w-full overflow-visible">
        {headGroup}
      </svg>
    );
  }

  const wagFast = pose === "happy" || pose === "excited" || pose === "dance" || pose === "love";
  return (
    <svg viewBox={viewBox} className="h-full w-full overflow-visible">
      <ellipse cx={60} cy={97} rx={26} ry={3} fill="#000" opacity={0.35} />
      <motion.g animate={body.animate} transition={body.transition} style={{ originX: "50%", originY: "100%" }}>
        {/* tail */}
        {kind === "cat" ? (
          <motion.path
            d="M78 86 C 98 88, 104 70, 96 58"
            stroke={palette.body}
            strokeWidth={7.5}
            strokeLinecap="round"
            fill="none"
            animate={{ rotate: pose === "sleep" ? 0 : wagFast ? [-14, 10, -14] : [-6, 8, -6] }}
            transition={loop(wagFast ? 0.7 : 2.6)}
            style={{ originX: "0%", originY: "100%" }}
          />
        ) : (
          <motion.path
            d="M79 84 Q93 80 95 66"
            stroke={palette.body}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
            animate={{ rotate: pose === "sleep" ? 0 : wagFast ? [-22, 22, -22] : pose === "sad" ? 30 : [-8, 8, -8] }}
            transition={pose === "sad" ? { duration: 0.5 } : loop(wagFast ? 0.28 : 1.6)}
            style={{ originX: "0%", originY: "100%" }}
          />
        )}
        <ellipse cx={60} cy={79} rx={23} ry={18} fill={palette.body} />
        <ellipse cx={60} cy={83} rx={12.5} ry={11} fill={palette.belly} />
        {/* paws */}
        <motion.ellipse
          cx={50} cy={94} rx={6.5} ry={4.2} fill={palette.belly}
          animate={pose === "walk" ? { y: [0, -3, 0, 0] } : pose === "dance" ? { y: [0, -2, 0] } : pose === "held" ? { y: 4 } : { y: 0 }}
          transition={loop(pose === "walk" ? 0.5 : 0.9)}
        />
        <motion.ellipse
          cx={70} cy={94} rx={6.5} ry={4.2} fill={palette.belly}
          animate={pose === "walk" ? { y: [0, 0, 0, -3, 0] } : pose === "dance" ? { y: [-2, 0, -2] } : pose === "held" ? { y: 4 } : { y: 0 }}
          transition={loop(pose === "walk" ? 0.5 : 0.9)}
        />
        {accessory === "scarf" && <Accessories which="scarf" kind={kind} />}
        {headGroup}
      </motion.g>
      {pose === "eat" && (
        <motion.g initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
          <path d="M42 92 L78 92 L74 100 L46 100 Z" fill="#8b7bff" />
          <ellipse cx={60} cy={92} rx={18} ry={3} fill="#a99dff" />
          <circle cx={54} cy={90.5} r={2.2} fill="#c9864a" />
          <circle cx={60} cy={90} r={2.4} fill="#b97538" />
          <circle cx={66} cy={90.6} r={2} fill="#c9864a" />
        </motion.g>
      )}
    </svg>
  );
}

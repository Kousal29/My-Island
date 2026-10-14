import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { paletteOf, petThePet, usePet, notePetInteraction } from "../state/pet";
import { letPetOut } from "../state/buddy";
import { useSettings } from "../state/settings";
import { PetSvg } from "./PetSvg";
import { cx } from "../lib/util";

/** Tiny vector particles (no emoji): crisp at any DPI and tinted to match. */
export function ParticleGlyph({ kind, size }: { kind: string; size: number }) {
  switch (kind) {
    case "heart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 3 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.9 0 6 4 4.5 7.3C19.5 16.4 12 21 12 21z" fill="#ff5d8f" />
          <path d="M7.2 7.6c-1.3.2-2.2 1.3-2.2 2.6" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.4} strokeLinecap="round" fill="none" />
        </svg>
      );
    case "star":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z" fill="#ffd24a" />
        </svg>
      );
    case "note":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--accent-ink)">
          <path d="M9 17.5V5.8l10-2.3v11.7" stroke="var(--accent-ink)" strokeWidth={2} fill="none" strokeLinejoin="round" />
          <ellipse cx="6.5" cy="17.8" rx="3" ry="2.4" />
          <ellipse cx="16.5" cy="15.4" rx="3" ry="2.4" />
        </svg>
      );
    case "zzz":
      return <span style={{ fontSize: size, color: "#b9c4ff", fontWeight: 800, lineHeight: 1 }}>z</span>;
    default:
      return <span className="block rounded-full" style={{ width: size * 0.35, height: size * 0.35, background: "#d9a066" }} />;
  }
}

function useLook(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return setLook({ x: 0, y: 0 });
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.4);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 160);
        setLook({ x: (dx / d) * k, y: (dy / d) * k });
      });
    };
    const reset = () => setLook({ x: 0, y: 0 });
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", reset);
      cancelAnimationFrame(raf);
    };
  }, [ref, enabled]);
  return look;
}

interface PetProps {
  size: number;
  variant?: "full" | "head";
  /** Lets the pet wander horizontally inside a stage of this width. */
  roam?: number;
  interactive?: boolean;
  showBubble?: boolean;
  /** Static pose with blinks only; for always-visible spots like the collapsed pill. */
  still?: boolean;
  /** Dragging the pet pulls it out of the island onto the desktop. */
  dragOut?: boolean;
  className?: string;
}

export function Pet({ size, variant = "full", roam = 0, interactive = true, showBubble = true, still = false, dragOut = true, className }: PetProps) {
  const press = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const { kind, pose, palette, accessory, particles, bubble } = usePet();
  const ref = useRef<HTMLDivElement>(null);
  const eyesFollow = useSettings((x) => x.petEyesFollow);
  // Still pets (the pill) still celebrate: one quick hop when something good happens.
  const cheer = useAnimationControls();
  useEffect(() => {
    if (!still || !["happy", "proud", "excited", "love"].includes(pose)) return;
    void cheer.start({ y: [0, -7, 0, -2.5, 0], transition: { duration: 0.6, ease: "easeOut" } });
  }, [pose, still, cheer]);
  const look = useLook(ref, !still && eyesFollow);
  const controls = useAnimationControls();
  const [facing, setFacing] = useState(1);
  const xRef = useRef(0);

  useEffect(() => {
    if (!roam || pose !== "walk") return;
    const half = roam / 2 - size / 2;
    let target = (Math.random() * 2 - 1) * half;
    if (Math.abs(target - xRef.current) < half * 0.4) target = -Math.sign(xRef.current || 1) * half * (0.5 + Math.random() * 0.5);
    setFacing(target > xRef.current ? 1 : -1);
    const duration = Math.abs(target - xRef.current) / 38;
    void controls.start({ x: target, transition: { duration, ease: "easeInOut" } }).then(() => (xRef.current = target));
    return () => controls.stop();
  }, [pose, roam, size, controls]);

  return (
    <motion.div animate={controls} className={cx("relative", className)} style={{ width: size, height: variant === "head" ? size * 0.76 : size * 0.84 }}>
      <motion.div
        ref={ref}
        className={cx("h-full w-full", interactive && "cursor-pointer", dragOut && "cursor-grab active:cursor-grabbing")}
        style={{ scaleX: pose === "walk" ? facing : 1, touchAction: "none" }}
        whileTap={interactive ? { scale: 0.9 } : undefined}
        title={dragOut ? "Drag me out onto your desktop!" : undefined}
        onPointerDown={(e) => {
          if (!dragOut) return;
          press.current = { x: e.clientX, y: e.clientY };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) return;
          press.current = null;
          dragged.current = true;
          void letPetOut(true);
        }}
        onPointerUp={() => (press.current = null)}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.stopPropagation();
            dragged.current = false;
          }
        }}
        onClick={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          notePetInteraction();
          petThePet();
        }}
      >
        <motion.div animate={cheer} className="h-full w-full" style={{ originY: 1 }}>
          <PetSvg kind={kind} pose={pose} palette={paletteOf(kind, palette)} accessory={accessory} look={look} variant={variant} still={still} />
        </motion.div>
      </motion.div>

      <div className="pointer-events-none absolute inset-0 overflow-visible">
        <AnimatePresence>
          {!still && particles.map((p, i) => {
            const spread = ((p.id * 53) % 100) / 100 - 0.5;
            return (
              <motion.span
                key={p.id}
                initial={{ opacity: 0, y: 0, x: spread * size * 0.5, scale: 0.4 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: p.kind === "crumb" ? [0, size * 0.1] : -size * (0.55 + (i % 3) * 0.12),
                  x: spread * size * (p.kind === "zzz" ? 0.3 : 0.9) + (p.kind === "zzz" ? size * 0.25 : 0),
                  scale: p.kind === "star" ? [0.4, 1.2, 0.8] : 1,
                  rotate: p.kind === "star" ? 90 : spread * 30,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: p.kind === "zzz" ? 2.6 : 1.4, delay: i * 0.12, ease: "easeOut" }}
                className="absolute left-1/2 font-bold"
                style={{
                  top: p.kind === "crumb" ? "78%" : "18%",
                  fontSize: Math.max(9, size * (p.kind === "zzz" ? 0.17 : 0.15)),
                  textShadow: "0 0 8px rgba(0,0,0,0.6)",
                }}
              >
                <ParticleGlyph kind={p.kind} size={Math.max(9, size * (p.kind === "zzz" ? 0.17 : 0.15))} />
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showBubble && bubble && (
          <motion.div
            key={bubble.text}
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="pointer-events-none absolute bottom-[86%] left-[62%] z-10 origin-bottom-left rounded-2xl rounded-bl-[4px] bg-white px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-[#1f1a26] shadow-lg"
          >
            {bubble.text}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { paletteOf, petThePet, usePet, notePetInteraction } from "../state/pet";
import { letPetOut } from "../state/buddy";
import { PetSvg } from "./PetSvg";
import { cx } from "../lib/util";

const PARTICLE: Record<string, { glyph: string; color: string }> = {
  heart: { glyph: "❤", color: "#ff5d8f" },
  zzz: { glyph: "z", color: "#b9c4ff" },
  star: { glyph: "✦", color: "#ffd24a" },
  note: { glyph: "♪", color: "var(--accent-ink)" },
  crumb: { glyph: "•", color: "#d9a066" },
};

function useLook(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return;
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
  const look = useLook(ref, !still);
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
        <PetSvg kind={kind} pose={pose} palette={paletteOf(kind, palette)} accessory={accessory} look={look} variant={variant} still={still} />
      </motion.div>

      <div className="pointer-events-none absolute inset-0 overflow-visible">
        <AnimatePresence>
          {!still && particles.map((p, i) => {
            const spec = PARTICLE[p.kind];
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
                  color: spec.color,
                  fontSize: Math.max(9, size * (p.kind === "zzz" ? 0.17 : 0.15)),
                  textShadow: "0 0 8px rgba(0,0,0,0.6)",
                }}
              >
                {spec.glyph}
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

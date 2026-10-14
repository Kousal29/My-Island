import { AnimatePresence, motion } from "motion/react";
import { bouncy } from "../../ui/primitives";

export function Checkbox({ checked, onChange, color = "var(--accent)", size = 20 }: { checked: boolean; onChange: () => void; color?: string; size?: number }) {
  return (
    <motion.button
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      whileTap={{ scale: 0.75 }}
      whileHover={{ scale: 1.1 }}
      transition={bouncy}
      className="focus-ring relative grid shrink-0 place-items-center rounded-full outline-none"
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{ background: checked ? color : "rgba(0,0,0,0)", borderColor: checked ? color : "rgba(255,255,255,0.28)", scale: checked ? [1, 1.25, 1] : 1 }}
        transition={{ duration: 0.35 }}
        style={{ borderWidth: 1.8, borderStyle: "solid" }}
      />
      <svg viewBox="0 0 20 20" className="relative" style={{ width: size * 0.7, height: size * 0.7 }}>
        <motion.path
          d="M4.5 10.5 L8.5 14.2 L15.5 6.2"
          fill="none"
          stroke="#0b0b10"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.28, delay: checked ? 0.08 : 0 }}
        />
      </svg>
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span key="burst" className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 h-1 w-1 rounded-full"
                  style={{ background: color }}
                  initial={{ x: -2, y: -2, scale: 1 }}
                  animate={{ x: Math.cos(a) * size * 0.9 - 2, y: Math.sin(a) * size * 0.9 - 2, scale: 0 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              );
            })}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

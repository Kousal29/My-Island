import { motion, AnimatePresence, type HTMLMotionProps } from "motion/react";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/bridge";
import { cx } from "../lib/util";
import { useIsland } from "../state/island";

export const spring = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 } as const;
export const softSpring = { type: "spring", stiffness: 300, damping: 30 } as const;
export const bouncy = { type: "spring", stiffness: 600, damping: 18 } as const;

type BtnProps = HTMLMotionProps<"button"> & { tone?: "ghost" | "solid" | "accent" | "danger"; size?: "sm" | "md" | "lg"; active?: boolean };

export const IconButton = forwardRef<HTMLButtonElement, BtnProps & { label: string }>(function IconButton(
  { tone = "ghost", size = "md", active, label, className, children, ...rest },
  ref,
) {
  const dims = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-8 w-8";
  return (
    <motion.button
      ref={ref}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.88 }}
      transition={bouncy}
      className={cx(
        "focus-ring grid shrink-0 place-items-center rounded-full outline-none transition-colors",
        dims,
        tone === "ghost" && (active ? "bg-white/14 text-ink" : "text-ink-2 hover:bg-white/9 hover:text-ink"),
        tone === "solid" && "bg-white/10 text-ink hover:bg-white/16",
        tone === "accent" && "bg-[var(--accent)] text-black hover:brightness-110",
        tone === "danger" && "text-ink-2 hover:bg-bad/18 hover:text-bad",
        "disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export function Button({ tone = "solid", size = "md", className, children, ...rest }: BtnProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={bouncy}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-full font-medium outline-none transition-colors",
        size === "sm" ? "h-7 px-3 text-[12px]" : size === "lg" ? "h-10 px-5 text-[14px]" : "h-8 px-3.5 text-[12.5px]",
        tone === "solid" && "bg-white/10 text-ink hover:bg-white/16",
        tone === "ghost" && "text-ink-2 hover:bg-white/8 hover:text-ink",
        tone === "accent" && "bg-[var(--accent)] text-black hover:brightness-110",
        tone === "danger" && "bg-bad/15 text-bad hover:bg-bad/25",
        "disabled:pointer-events-none disabled:opacity-35",
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  color,
  layoutGroup,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  color?: string;
  layoutGroup?: string;
  className?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      data-active={active ? "true" : undefined}
      whileTap={{ scale: 0.92 }}
      transition={bouncy}
      className={cx(
        "focus-ring relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors",
        active ? "text-ink" : "text-ink-3 hover:bg-white/6 hover:text-ink-2",
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutGroup ? `chip-${layoutGroup}` : undefined}
          transition={spring}
          className="absolute inset-0 rounded-full bg-white/11 ring-1 ring-white/8"
          style={color ? { background: `color-mix(in oklab, ${color} 24%, transparent)` } : undefined}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </motion.button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "focus-ring relative h-[22px] w-[38px] shrink-0 rounded-full outline-none transition-colors duration-300",
        checked ? "bg-[var(--accent)]" : "bg-white/14",
      )}
    >
      <motion.span
        layout
        transition={bouncy}
        className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
        style={{ left: checked ? 19 : 3 }}
      />
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  color = "var(--accent)",
  className,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const fromEvent = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const raw = min + t * (max - min);
    onChange(Math.round(raw / step) * step);
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={cx("focus-ring group relative flex h-5 cursor-pointer items-center outline-none", className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        fromEvent(e.clientX);
      }}
      onPointerMove={(e) => drag && fromEvent(e.clientX)}
      onPointerUp={() => setDrag(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(max, value + step * 5));
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(min, value - step * 5));
      }}
    >
      <div className={cx("relative w-full overflow-hidden rounded-full bg-white/12 transition-all", drag ? "h-2" : "h-1.5 group-hover:h-2")}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div
        className={cx("absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-md transition-transform", drag ? "scale-110" : "scale-0 group-hover:scale-100")}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="inline-flex rounded-full bg-white/7 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx("focus-ring relative h-6 rounded-full px-2.5 text-[11.5px] font-medium outline-none transition-colors", value === o.value ? "text-ink" : "text-ink-3 hover:text-ink-2")}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-white/14" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Ring({
  value,
  size = 36,
  stroke = 4,
  color = "var(--accent)",
  track = "rgb(255 255 255 / 0.1)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={softSpring}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

/** Scrolls overflowing text back and forth, like the iOS now-playing title. */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const diff = i.scrollWidth - o.clientWidth;
    setShift(diff > 4 ? -(diff + 12) : 0);
  }, [text]);
  return (
    <div ref={outer} className={cx("overflow-hidden whitespace-nowrap", shift !== 0 && "[mask-image:linear-gradient(90deg,transparent,black_6px,black_calc(100%-14px),transparent)]", className)}>
      <span
        ref={inner}
        className="inline-block"
        style={
          shift
            ? ({ "--marquee-shift": `${shift}px`, animation: `marquee ${Math.max(6, -shift / 14)}s ease-in-out infinite alternate` } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}

export function Empty({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center"
    >
      <motion.div
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={bouncy}
        className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6 text-ink-2"
      >
        {icon}
      </motion.div>
      <div className="text-[13px] font-semibold text-ink-2">{title}</div>
      {hint && <div className="max-w-[260px] text-[11.5px] leading-relaxed text-ink-3">{hint}</div>}
      {children}
    </motion.div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-white/10 bg-white/6 px-1.5 py-[1px] font-sans text-[10.5px] font-medium text-ink-2">{children}</kbd>;
}

export function Equalizer({ playing, color = "var(--accent)", bars = 4, height = 14 }: { playing: boolean; color?: string; bars?: number; height?: number }) {
  return (
    <div className="flex items-center gap-[2.5px]" style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="w-[3px] origin-center rounded-full"
          style={{
            height: "100%",
            background: color,
            animation: playing ? `eq ${0.7 + ((i * 37) % 5) / 10}s ease-in-out ${i * 0.12}s infinite` : "none",
            transform: playing ? undefined : "scaleY(0.25)",
            transition: "transform 0.3s",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Anchored floating panel rendered in a portal: never clipped, flips above when
 * there's no room, and keeps the island expanded + clickable while open.
 */
export function Popover({
  trigger,
  children,
  align = "right",
  width,
  estHeight = 240,
  className,
}: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  estHeight?: number;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = () => setPos(null);

  const toggle = () => {
    if (open) return close();
    const r = anchor.current!.getBoundingClientRect();
    const up = r.bottom + estHeight + 8 > window.innerHeight && r.top - estHeight - 8 > 0;
    setPos({ x: align === "right" ? r.right : r.left, y: up ? r.top - 6 : r.bottom + 6, up });
  };

  useEffect(() => {
    if (!open) return;
    useIsland.getState().hold(1);
    void api.setForceInteractive(true);
    const onDown = (e: PointerEvent) => !panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      useIsland.getState().hold(-1);
      if (useIsland.getState().holds === 0) void api.setForceInteractive(false);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  return (
    <div ref={anchor} className="relative">
      {trigger(toggle, open)}
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              ref={panel}
              data-popover-open=""
              initial={{ opacity: 0, scale: 0.94, y: pos.up ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
              transition={spring}
              className={cx(
                "fixed z-[100] rounded-2xl border border-white/10 bg-panel-2/98 p-1 shadow-[0_18px_40px_-8px_rgba(0,0,0,0.85)] backdrop-blur-xl",
                className,
              )}
              style={{
                width,
                left: align === "left" ? pos.x : undefined,
                right: align === "right" ? window.innerWidth - pos.x : undefined,
                top: pos.up ? undefined : pos.y,
                bottom: pos.up ? window.innerHeight - pos.y : undefined,
                transformOrigin: `${pos.up ? "bottom" : "top"} ${align}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {children(close)}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

export type MenuItem = { label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean; hint?: ReactNode } | "sep" | { header: ReactNode };

export function Menu({
  trigger,
  items,
  align = "right",
}: {
  trigger: (open: () => void) => ReactNode;
  items: (MenuItem | null | false | undefined)[];
  align?: "left" | "right";
}) {
  const rows = items.filter(Boolean) as MenuItem[];
  const estH = rows.reduce((h, it) => h + (it === "sep" ? 9 : "header" in it ? 24 : 30), 8);
  return (
    <Popover trigger={(t) => trigger(t)} align={align} estHeight={Math.min(320, estH)} className="max-h-[320px] min-w-[180px] overflow-y-auto">
      {(close) =>
        rows.map((it, i) =>
          it === "sep" ? (
            <div key={i} className="my-1 h-px bg-white/8" />
          ) : "header" in it ? (
            <div key={i} className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-ink-4 uppercase">
              {it.header}
            </div>
          ) : (
            <motion.button
              key={i}
              role="menuitem"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.018 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                close();
                it.onSelect();
              }}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                it.danger ? "text-bad hover:bg-bad/14" : "text-ink-2 hover:bg-white/8 hover:text-ink",
              )}
            >
              {it.icon && <span className="grid w-4 place-items-center opacity-80">{it.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-[10.5px] text-ink-4">{it.hint}</span>}
            </motion.button>
          ),
        )
      }
    </Popover>
  );
}

/**
 * Horizontal row that scrolls: mouse wheel scrolls sideways, edges fade when there's more,
 * arrow buttons appear on hover, and the `data-active` child is kept in view.
 */
export function HScroll({ children, className, watch }: { children: ReactNode; className?: string; watch?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    // Bail out when unchanged: this runs after every render, so a fresh object would loop forever.
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };
  useLayoutEffect(update);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 1.2, behavior: "smooth" });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [watch]);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = (dir: 1 | -1) => (
    <motion.button
      key={dir}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.15 }}
      onClick={() => page(dir)}
      aria-label={dir < 0 ? "Scroll left" : "Scroll right"}
      className={cx(
        "absolute top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-panel-3 text-ink-2 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-white/10 transition-opacity group-hover/hs:opacity-100 hover:text-ink",
        dir < 0 ? "left-0" : "right-0",
      )}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir < 0 ? "M6.5 2 L3.5 5 L6.5 8" : "M3.5 2 L6.5 5 L3.5 8"} />
      </svg>
    </motion.button>
  );
  return (
    <div className={cx("group/hs relative min-w-0", className)}>
      <div ref={ref} onScroll={update} className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-island to-transparent transition-opacity duration-200"
        style={{ opacity: edges.left ? 1 : 0 }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-island to-transparent transition-opacity duration-200"
        style={{ opacity: edges.right ? 1 : 0 }}
      />
      <AnimatePresence>
        {edges.left && arrow(-1)}
        {edges.right && arrow(1)}
      </AnimatePresence>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between px-0.5">
      <div className="text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{children}</div>
      {right}
    </div>
  );
}

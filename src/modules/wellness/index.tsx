import { AnimatePresence, motion } from "motion/react";
import { Eye, Footprints, GlassWater, HeartPulse, Minus, PawPrint, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { play } from "../../lib/sound";
import { cx } from "../../lib/util";
import { glassesToday, logWater, nextDue, snooze, startEyeBreak, takeBreak, useWellness, type Reminder } from "../../state/wellness";
import { Ring, Segmented, Toggle, bouncy } from "../../ui/primitives";
import { Pet } from "../../pet/Pet";
import { usePet } from "../../state/pet";
import { petReact } from "../../state/buddy";
import { useIsland } from "../../state/island";
import type { IslandModule } from "../types";

const META: Record<Reminder, { title: string; hint: string; icon: typeof Eye; color: string; options: number[] }> = {
  water: { title: "Drink water", hint: "A glass every so often keeps you sharp.", icon: GlassWater, color: "#4fb4ff", options: [30, 45, 60, 90] },
  break: { title: "Stretch break", hint: "Stand up, move, unclench your shoulders.", icon: Footprints, color: "#3fe0b0", options: [30, 45, 50, 60] },
  eyes: { title: "20-20-20 eyes", hint: "Every 20 min, look 20 ft away for 20 s.", icon: Eye, color: "#b18cff", options: [15, 20, 30] },
};

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

const mins = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function Glass({ filled, i }: { filled: boolean; i: number }) {
  return (
    <div className="relative h-9 w-7">
      <svg viewBox="0 0 28 36" className="absolute inset-0 h-full w-full">
        <path d="M4 3 H24 L21.5 32 Q21.2 34 19 34 H9 Q6.8 34 6.5 32 Z" fill="rgb(255 255 255 / 0.06)" stroke="rgb(255 255 255 / 0.22)" strokeWidth={1.4} />
      </svg>
      <motion.div
        className="absolute inset-x-[5px] bottom-[2px] overflow-hidden rounded-b-[5px]"
        initial={false}
        animate={{ height: filled ? "72%" : "0%" }}
        transition={{ type: "spring", stiffness: 160, damping: 16, delay: filled ? i * 0.04 : 0 }}
        style={{ background: "linear-gradient(180deg, #7cc8ff, #3a8fe0)", clipPath: "polygon(0 0, 100% 0, 92% 100%, 8% 100%)" }}
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-white/45" />
      </motion.div>
    </div>
  );
}

function WaterCard() {
  const s = useWellness();
  const n = glassesToday(s);
  const goal = s.water.goal;
  const done = n >= goal;
  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.045] p-3.5 ring-1 ring-white/[0.05]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
          <GlassWater size={15} className="text-[#4fb4ff]" />
          Water today
        </div>
        <span className={cx("tabular text-[12px] font-semibold", done ? "text-good" : "text-ink-2")}>
          {n} / {goal}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {Array.from({ length: goal }, (_, i) => (
          <Glass key={i} i={i} filled={i < n} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ y: -1 }}
          transition={bouncy}
          onClick={() => {
            logWater(1);
            play("pop");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#4fb4ff] py-2 text-[12.5px] font-semibold text-black"
        >
          <Plus size={14} strokeWidth={2.6} /> Add a glass
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => logWater(-1)} disabled={n === 0} className="grid h-9 w-9 place-items-center rounded-xl bg-white/7 text-ink-2 hover:bg-white/12 disabled:opacity-30" aria-label="Remove a glass">
          <Minus size={14} />
        </motion.button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-3">
        <span>{done ? "Goal reached — nicely done" : `${goal - n} to go`}</span>
        <span className="flex items-center gap-1.5">
          Goal
          <Segmented id="goal" value={String(goal)} onChange={(v) => s.set({ water: { ...s.water, goal: +v } })} options={["6", "8", "10"].map((v) => ({ value: v, label: v }))} />
        </span>
      </div>
    </div>
  );
}

function ReminderRow({ r }: { r: Reminder }) {
  const s = useWellness();
  const m = META[r];
  const prefs = s[r];
  const left = nextDue(s, r) - Date.now();
  const Icon = m.icon;
  return (
    <div className={cx("rounded-2xl p-3 ring-1 transition-colors", prefs.enabled ? "bg-white/[0.045] ring-white/[0.05]" : "bg-transparent ring-white/[0.04]")}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${m.color} 18%, transparent)`, color: m.color }}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold">{m.title}</div>
          <div className="truncate text-[10.5px] text-ink-3">{prefs.enabled ? `Next in ${mins(left)}` : m.hint}</div>
        </div>
        <Toggle checked={prefs.enabled} onChange={(v) => s.set({ [r]: { ...prefs, enabled: v }, last: { ...s.last, [r]: Date.now() } } as never)} label={m.title} />
      </div>
      <AnimatePresence initial={false}>
        {prefs.enabled && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="flex items-center justify-between pt-2.5 pl-[42px]">
              <span className="text-[10.5px] text-ink-3">Every</span>
              <Segmented
                id={`every-${r}`}
                value={String(prefs.everyMin)}
                onChange={(v) => s.set({ [r]: { ...prefs, everyMin: +v } } as never)}
                options={m.options.map((o) => ({ value: String(o), label: `${o}m` }))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WellnessView() {
  useTick(15_000);
  const s = useWellness();
  return (
    <div className="flex h-full gap-3">
      <div className="flex w-[268px] shrink-0 flex-col gap-2.5">
        <WaterCard />
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.045] px-3.5 py-2.5 ring-1 ring-white/[0.05]">
          <span className="text-[11.5px] text-ink-2">Pause during calls</span>
          <Toggle checked={s.pauseInCalls} onChange={(v) => s.set({ pauseInCalls: v })} label="Pause during calls" />
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            const order: Reminder[] = ["water", "eyes", "break"];
            const next = order[(order.indexOf(s.due ?? "break") + 1) % order.length];
            s.set({ due: next });
            useIsland.getState().collapse();
          }}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.045] py-2 text-[11.5px] text-ink-2 ring-1 ring-white/[0.05] hover:bg-white/[0.08] hover:text-ink"
        >
          <Eye size={12} /> Preview a reminder in the notch
        </motion.button>
        <div className="px-1 text-[10.5px] leading-relaxed text-ink-4">Stepping away for 5+ minutes counts as a break — timers reset when you're back.</div>
      </div>
      <div className="scroll flex min-w-0 flex-1 flex-col gap-2 pr-1">
        <ReminderRow r="eyes" />
        <ReminderRow r="break" />
        <ReminderRow r="water" />
      </div>
    </div>
  );
}

/** The cat's head with a little prop badge: it's the one bringing you the reminder. */
function CatWithProp({ r }: { r: Reminder }) {
  const out = usePet((p) => p.out);
  const m = META[r];
  const Icon = m.icon;
  return (
    <motion.span initial={{ scale: 0.5, y: 6 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 520, damping: 14 }} className="relative flex h-7 w-8 items-end">
      {out ? (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-ink-2">
          <PawPrint size={12} />
        </span>
      ) : (
        <Pet size={32} variant="head" interactive={false} showBubble={false} still dragOut={false} />
      )}
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 15, delay: 0.12 }}
        className="absolute -right-1 -bottom-0.5 grid h-[15px] w-[15px] place-items-center rounded-full ring-2 ring-island"
        style={{ background: m.color, color: "#0b0b10" }}
      >
        <Icon size={9} strokeWidth={2.6} />
      </motion.span>
    </motion.span>
  );
}

/** Pill content while a reminder is due or an eye break is counting down. */
function useWellnessActivity() {
  const due = useWellness((s) => s.due);
  const eyeUntil = useWellness((s) => s.eyeBreakUntil);
  const name = usePet((p) => p.name);
  const [, force] = useState(0);
  useEffect(() => {
    if (!eyeUntil) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [eyeUntil]);

  if (eyeUntil) {
    const left = Math.max(0, eyeUntil - Date.now());
    return {
      priority: 92,
      width: 300,
      opens: "wellness",
      left: <CatWithProp r="eyes" />,
      center: (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[11.5px] font-semibold text-ink">Look 20 ft away</span>
          <span className="truncate text-[10.5px] text-ink-3">{name} is resting their eyes too</span>
        </span>
      ),
      right: (
        <Ring value={1 - left / 20000} size={26} stroke={3} color="#b18cff">
          <span className="tabular text-[9.5px] font-bold text-ink">{Math.ceil(left / 1000)}</span>
        </Ring>
      ),
    };
  }
  if (!due) return null;
  const m = META[due];
  const act = (label: string, fn: () => void, primary = false) => (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ y: -1 }}
      onClick={(e) => {
        e.stopPropagation();
        fn();
      }}
      className={cx("h-6 rounded-full px-2.5 text-[11px] font-semibold", primary ? "text-black" : "bg-white/10 text-ink-2 hover:bg-white/16")}
      style={primary ? { background: m.color } : undefined}
    >
      {label}
    </motion.button>
  );
  const line = {
    water: [`${name}'s thirsty`, "— you too?"],
    eyes: ["Eye break", `rest with ${name}`],
    break: [`Stretch with ${name}!`, "up and move a bit"],
  }[due];
  return {
    priority: 78,
    width: 350,
    opens: "wellness",
    left: <CatWithProp r={due} />,
    center: (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11.5px] font-semibold text-ink">{line[0]}</span>
        <span className="truncate text-[10.5px] text-ink-3">{line[1]}</span>
      </span>
    ),
    right: (
      <span className="flex items-center gap-1">
        {act("Later", () => snooze(due))}
        {due === "water" &&
          act(
            "+1 glass",
            () => {
              logWater(1);
              play("pop");
              petReact("happy", 1800, "Ahh, refreshing!");
            },
            true,
          )}
        {due === "eyes" &&
          act(
            "Start 20s",
            () => {
              startEyeBreak();
              petReact("sleep", 20000);
            },
            true,
          )}
        {due === "break" &&
          act(
            "Done",
            () => {
              takeBreak();
              play("success");
              petReact("excited", 2000, "Nice stretch!");
            },
            true,
          )}
      </span>
    ),
  };
}

export const wellnessModule: IslandModule = {
  id: "wellness",
  title: "Wellness",
  icon: HeartPulse,
  size: { w: 620, h: 376 },
  View: WellnessView,
  useActivity: useWellnessActivity,
  description: "Water, stretch breaks and 20-20-20 eye rests — gentle reminders that pause during calls.",
};


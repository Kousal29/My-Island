import { AnimatePresence, motion } from "motion/react";
import { Cat, Dog, Hand, Home as HomeIcon, Lock, Moon, PawPrint, Pencil, Sun, Volleyball } from "lucide-react";
import { callPetHome, letPetOut } from "../../state/buddy";
import { useState } from "react";
import { cx } from "../../lib/util";
import { ACCESSORIES, PALETTES, feed, mood, notePetInteraction, petThePet, playWith, react, usePet, xpForLevel, type Food } from "../../state/pet";
import { useSettings } from "../../state/settings";
import { Pet } from "../../pet/Pet";
import { Button, Menu, bouncy, softSpring } from "../../ui/primitives";
import type { IslandModule } from "../types";

const FOODS: Record<"cat" | "dog", { id: Food; emoji: string; label: string }[]> = {
  cat: [
    { id: "fish", emoji: "🐟", label: "Fish" },
    { id: "milk", emoji: "🥛", label: "Milk" },
    { id: "cookie", emoji: "🍪", label: "Treat" },
  ],
  dog: [
    { id: "bone", emoji: "🦴", label: "Bone" },
    { id: "milk", emoji: "🥛", label: "Milk" },
    { id: "cookie", emoji: "🍪", label: "Biscuit" },
  ],
};

function Meter({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  const low = value < 25;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-2">
          {emoji} {label}
        </span>
        <span className={cx("tabular", low ? "font-semibold text-warn" : "text-ink-3")}>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${value}%` }} transition={softSpring} />
      </div>
    </div>
  );
}

function Stage({ ball, onBallDone }: { ball: number; onBallDone: () => void }) {
  const pose = usePet((s) => s.pose);
  const out = usePet((s) => s.out);
  const name = usePet((s) => s.name);
  const hour = new Date().getHours();
  const night = hour < 7 || hour >= 20;
  return (
    <div
      className="relative h-full overflow-hidden rounded-3xl"
      style={{
        background: night
          ? "radial-gradient(120% 90% at 50% 0%, #252447 0%, #13121f 70%)"
          : "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--accent) 30%, #1a1a24) 0%, #14141b 75%)",
      }}
    >
      {night ? (
        <>
          {Array.from({ length: 14 }, (_, i) => (
            <motion.span
              key={i}
              className="absolute h-[2px] w-[2px] rounded-full bg-white"
              style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 45}%` }}
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
          <Moon size={18} className="absolute top-3 right-4 text-[#ffe9a8]" fill="#ffe9a8" />
        </>
      ) : (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }} className="absolute top-2.5 right-3.5 text-[#ffd24a]">
          <Sun size={20} />
        </motion.div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-b from-white/[0.035] to-white/[0.07]" />
      <div className="absolute inset-x-6 bottom-[30%] h-px bg-white/8" />
      {/* cushion */}
      <div className="absolute bottom-[14%] left-1/2 h-5 w-36 -translate-x-1/2 rounded-[50%] bg-[var(--accent)]/22 blur-[1px]" />

      <AnimatePresence>
        {ball > 0 && (
          <motion.div
            key={ball}
            className="absolute bottom-[18%] text-[18px]"
            initial={{ left: "8%", y: 0 }}
            animate={{ left: ["8%", "50%", "82%", "40%"], y: [0, -40, 0, -24, 0, -10, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
            onAnimationComplete={onBallDone}
          >
            ⚽
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {out ? (
          <motion.div key="out" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <motion.div animate={{ x: [-30, 30, -30] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="text-[22px] opacity-70">
              🐾
            </motion.div>
            <div className="text-[13px] font-semibold">{name} is out exploring your desktop</div>
            <div className="max-w-[240px] text-[11px] text-ink-3">Look near your taskbar. Drag to toss, click to pet, double-click for zoomies.</div>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={callPetHome} className="mt-1 flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-black">
              <HomeIcon size={13} /> Call {name} home
            </motion.button>
          </motion.div>
        ) : (
          <motion.div key="in" initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="absolute inset-x-0 bottom-[11%] flex justify-center">
            <Pet size={150} roam={300} />
          </motion.div>
        )}
      </AnimatePresence>
      {pose === "sleep" && !out && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10.5px] text-ink-3">Shh… sleeping. Tap to wake.</div>}
    </div>
  );
}

function PetView() {
  const s = usePet();
  const [editingName, setEditingName] = useState(false);
  const [ball, setBall] = useState(0);
  const need = xpForLevel(s.level);
  const m = mood(s);
  const ageDays = Math.max(1, Math.round((Date.now() - s.bornAt) / 86400000));

  return (
    <div className="flex h-full gap-3">
      <div className="min-w-0 flex-[1.15]">
        <Stage ball={ball} onBallDone={() => setBall(0)} />
      </div>
      <div className="flex w-[230px] shrink-0 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              defaultValue={s.name}
              maxLength={16}
              onBlur={(e) => (s.set({ name: e.target.value.trim() || s.name }), setEditingName(false))}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") (e.stopPropagation(), setEditingName(false));
              }}
              className="h-7 w-28 rounded-lg bg-white/8 px-2 font-display text-[16px] font-semibold outline-none"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="group flex items-center gap-1.5 font-display text-[18px] font-semibold">
              {s.name}
              <Pencil size={11} className="text-ink-4 opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10.5px] text-ink-2">
            {m.emoji} {m.label}
          </span>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[10.5px] text-ink-3">
            <span className="font-semibold text-[var(--accent-ink)]">Level {s.level}</span>
            <span className="tabular">
              {Math.round(s.xp)}/{need} xp · {ageDays}d old
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ff8fb8]"
              initial={false}
              animate={{ width: `${(s.xp / need) * 100}%` }}
              transition={softSpring}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Meter label="Fullness" value={s.fullness} color="#ff9f6e" emoji="🍖" />
          <Meter label="Happiness" value={s.happiness} color="#ff6f9c" emoji="💖" />
          <Meter label="Energy" value={s.energy} color="#3fe0b0" emoji="⚡" />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <ActionButton
            label="Pet"
            icon={<Hand size={15} />}
            onClick={() => {
              notePetInteraction();
              petThePet();
            }}
          />
          <Menu
            align="left"
            trigger={(open) => <ActionButton label="Feed" icon={<span className="text-[14px]">{s.kind === "cat" ? "🐟" : "🦴"}</span>} onClick={open} />}
            items={FOODS[s.kind].map((f) => ({ label: `${f.emoji} ${f.label}`, onSelect: () => (notePetInteraction(), feed(f.id)) }))}
          />
          <ActionButton
            label="Play"
            icon={<Volleyball size={15} />}
            onClick={() => {
              notePetInteraction();
              playWith();
              if (s.energy >= 15) setBall(Date.now());
            }}
          />
        </div>
        <motion.button
          whileHover={{ y: -2, scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          transition={bouncy}
          onClick={() => (s.out ? callPetHome() : void letPetOut())}
          className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl py-2 text-[12px] font-semibold text-black"
          style={{ background: "linear-gradient(135deg, var(--accent), #ff8fb8)" }}
        >
          <motion.span animate={s.out ? {} : { rotate: [0, -14, 14, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.5 }}>
            {s.out ? <HomeIcon size={14} /> : <PawPrint size={14} />}
          </motion.span>
          {s.out ? `Call ${s.name} home` : `Let ${s.name} roam the desktop`}
        </motion.button>
        <Button
          size="sm"
          tone="ghost"
          onClick={() => (s.pose === "sleep" ? react("yawn", 1500, "Good morning!") : usePet.setState({ pose: "sleep", poseUntil: Date.now() + 90000 }))}
        >
          <Moon size={12} /> {s.pose === "sleep" ? "Wake up" : "Nap time"}
        </Button>
        <div className="mt-auto text-[10px] leading-relaxed text-ink-4">
          Earns XP when you finish tasks & focus sessions. Pet {s.totalPets}× · fed {s.totalFeeds}×
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.9 }}
      transition={bouncy}
      onClick={onClick}
      className="flex w-full flex-col items-center gap-0.5 rounded-xl bg-white/6 py-1.5 text-[10.5px] text-ink-2 hover:bg-white/11 hover:text-ink"
    >
      {icon}
      {label}
    </motion.button>
  );
}

/** Customization panel, also used inside Settings. */
export function PetCustomizer() {
  const s = usePet();
  const setKind = (kind: "cat" | "dog") => {
    if (kind === s.kind) return;
    s.set({ kind, palette: PALETTES[kind][0].id });
    react("excited", 1800, kind === "cat" ? "Meow!" : "Woof!");
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["cat", "dog"] as const).map((k) => (
          <motion.button
            key={k}
            whileTap={{ scale: 0.94 }}
            onClick={() => setKind(k)}
            className={cx(
              "flex flex-1 items-center justify-center gap-2 rounded-2xl py-2 text-[12.5px] font-medium ring-1 transition-colors",
              s.kind === k ? "bg-[var(--accent)]/18 text-ink ring-[var(--accent)]/60" : "bg-white/5 text-ink-3 ring-white/5 hover:text-ink-2",
            )}
          >
            {k === "cat" ? <Cat size={15} /> : <Dog size={15} />}
            {k === "cat" ? "Cat" : "Dog"}
          </motion.button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {PALETTES[s.kind].map((p) => (
          <motion.button
            key={p.id}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            title={p.label}
            onClick={() => s.set({ palette: p.id })}
            className={cx("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-panel transition", s.palette === p.id ? "ring-white" : "ring-transparent")}
            style={{ background: `linear-gradient(135deg, ${p.body} 55%, ${p.belly} 55%)` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {ACCESSORIES.map((a) => {
          const locked = s.level < a.level;
          return (
            <button
              key={a.id}
              disabled={locked}
              onClick={() => s.set({ accessory: a.id })}
              className={cx(
                "flex items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] transition-colors",
                s.accessory === a.id ? "bg-white/14 text-ink" : "bg-white/5 text-ink-3 hover:text-ink-2",
                locked && "opacity-45",
              )}
            >
              {locked ? <Lock size={10} /> : null}
              {a.label}
              {locked && <span className="text-[9.5px]">Lv{a.level}</span>}
            </button>
          );
        })}
      </div>
      <PetPillToggle />
    </div>
  );
}

function PetPillToggle() {
  const { showPetInPill, set } = useSettings();
  return (
    <button onClick={() => set({ showPetInPill: !showPetInPill })} className="flex items-center gap-1.5 text-[11.5px] text-ink-3 hover:text-ink-2">
      <PawPrint size={12} /> {showPetInPill ? "Hide" : "Show"} pet in the collapsed island
    </button>
  );
}

export const petModule: IslandModule = {
  id: "pet",
  title: "Pet",
  icon: PawPrint,
  size: { w: 640, h: 360 },
  View: PetView,
  description: "Your island buddy. Pet, feed and play — it levels up as you get things done.",
};

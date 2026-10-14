import { AnimatePresence, motion } from "motion/react";
import { Bone, Cat, Cookie, Dog, Drumstick, Eye, EyeOff, Fish, Hand, Heart, Home as HomeIcon, Lock, Milk, Moon, PawPrint, Pencil, Sun, Volleyball, Zap, type LucideIcon } from "lucide-react";
import { callPetHome, letPetOut, prepareBuddy } from "../../state/buddy";
import { useEffect, useState } from "react";
import { cx } from "../../lib/util";
import { ACCESSORIES, PALETTES, feed, mood, notePetInteraction, petThePet, playWith, react, usePet, xpForLevel, type Food } from "../../state/pet";
import { useSettings } from "../../state/settings";
import { Pet } from "../../pet/Pet";
import { Menu, Toggle, bouncy, softSpring } from "../../ui/primitives";
import type { IslandModule } from "../types";

const FOODS: Record<"cat" | "dog", { id: Food; icon: LucideIcon; label: string }[]> = {
  cat: [
    { id: "fish", icon: Fish, label: "Fish" },
    { id: "milk", icon: Milk, label: "Milk" },
    { id: "cookie", icon: Cookie, label: "Treat" },
  ],
  dog: [
    { id: "bone", icon: Bone, label: "Bone" },
    { id: "milk", icon: Milk, label: "Milk" },
    { id: "cookie", icon: Cookie, label: "Biscuit" },
  ],
};

function Meter({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: LucideIcon }) {
  const low = value < 25;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Icon size={12} style={{ color }} />
            {label}
          </span>
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
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="9" fill="#ff8fb8" />
              <path d="M2.5 7.5 Q10 11 17.5 7.5 M3 13.5 Q10 9.5 17 13.5" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.4} fill="none" />
              <circle cx="7" cy="6" r="2" fill="#fff" opacity={0.45} />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {out ? (
          <motion.div key="out" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <motion.div initial={{ scale: 0.6, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={bouncy} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/7 text-ink-2">
              <PawPrint size={20} />
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
  useEffect(prepareBuddy, []);
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
      <div className="flex w-[240px] shrink-0 flex-col gap-2">
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
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: m.color }} />
            {m.label}
          </span>
          <EyesToggle />
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[10.5px] text-ink-3">
            <span className="font-semibold text-[var(--accent-ink)]" title={`Earns XP when you finish tasks & focus sessions · petted ${s.totalPets}× · fed ${s.totalFeeds}×`}>
              Level {s.level}
            </span>
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
          <Meter label="Fullness" value={s.fullness} color="#ff9f6e" icon={Drumstick} />
          <Meter label="Happiness" value={s.happiness} color="#ff6f9c" icon={Heart} />
          <Meter label="Energy" value={s.energy} color="#3fe0b0" icon={Zap} />
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <ActionTile
            label="Pet"
            color="#ff6f9c"
            icon={<Hand size={15} />}
            onClick={() => {
              notePetInteraction();
              petThePet();
            }}
          />
          <Menu
            align="left"
            trigger={(open) => <ActionTile label="Feed" color="#ff9f6e" icon={s.kind === "cat" ? <Fish size={15} /> : <Bone size={15} />} onClick={open} />}
            items={FOODS[s.kind].map((f) => ({ label: f.label, icon: <f.icon size={13} />, onSelect: () => (notePetInteraction(), feed(f.id)) }))}
          />
          <ActionTile
            label="Play"
            color="#3fe0b0"
            icon={<Volleyball size={15} />}
            onClick={() => {
              notePetInteraction();
              playWith();
              if (s.energy >= 15) setBall(Date.now());
            }}
          />
          <ActionTile
            label={s.pose === "sleep" ? "Wake" : "Nap"}
            color="#9aa6ff"
            active={s.pose === "sleep"}
            icon={s.pose === "sleep" ? <Sun size={15} /> : <Moon size={15} />}
            onClick={() => (s.pose === "sleep" ? react("yawn", 1500, "Good morning!") : usePet.setState({ pose: "sleep", poseUntil: Date.now() + 90000 }))}
          />
        </div>

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={bouncy}
          onClick={() => (s.out ? callPetHome() : void letPetOut())}
          className="group flex items-center gap-2.5 rounded-2xl bg-white/[0.045] py-2 pr-2.5 pl-2 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/20 text-[var(--accent-ink)] transition-transform group-hover:scale-110">
            {s.out ? <HomeIcon size={14} /> : <PawPrint size={14} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-ink">{s.out ? `Call ${s.name} home` : `Let ${s.name} roam`}</span>
            <span className="block truncate text-[10.5px] text-ink-3">{s.out ? "Back into the island" : "Out onto your desktop"} · Ctrl+Alt+B</span>
          </span>
        </motion.button>

      </div>
    </div>
  );
}

function ActionTile({ label, icon, color, active, onClick }: { label: string; icon: React.ReactNode; color: string; active?: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.92 }}
      transition={bouncy}
      onClick={onClick}
      className={cx(
        "group flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[10.5px] font-medium ring-1 transition-colors",
        active ? "text-ink" : "bg-white/[0.045] text-ink-2 ring-white/[0.06] hover:bg-white/[0.08] hover:text-ink",
      )}
      style={active ? { background: `color-mix(in oklab, ${color} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)` } : undefined}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
        style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
      >
        {icon}
      </span>
      {label}
    </motion.button>
  );
}

/** Compact header toggle: does the pet watch your cursor? */
function EyesToggle() {
  const { petEyesFollow, set } = useSettings();
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={() => set({ petEyesFollow: !petEyesFollow })}
      title={petEyesFollow ? "Eyes follow your cursor — click to turn off" : "Eyes don't follow your cursor — click to turn on"}
      aria-pressed={petEyesFollow}
      className={cx(
        "ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors",
        petEyesFollow ? "bg-[var(--accent)]/20 text-[var(--accent-ink)]" : "bg-white/6 text-ink-4 hover:text-ink-2",
      )}
    >
      {petEyesFollow ? <Eye size={14} /> : <EyeOff size={14} />}
    </motion.button>
  );
}

function EyesFollowRow() {
  const { petEyesFollow, set } = useSettings();
  return (
    <label className="flex items-center justify-between px-1 text-[11px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <Eye size={12} /> Eyes follow your cursor
      </span>
      <Toggle checked={petEyesFollow} onChange={(v) => set({ petEyesFollow: v })} label="Eyes follow cursor" />
    </label>
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
      <EyesFollowRow />
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
  size: { w: 660, h: 372 },
  View: PetView,
  description: "Your island buddy. Pet, feed and play — it levels up as you get things done.",
};

import { motion } from "motion/react";
import {
  Archive, BookOpen, Bookmark, Brain, Briefcase, Calendar, Camera, ClipboardList, Code2, Coffee, Dumbbell, Feather, FileText, Flag, FlaskConical,
  Folder, Gamepad2, Globe, GraduationCap, Heart, Home, Inbox, Layers, Leaf, Lightbulb, Music, Package, Palette, PenLine, Plane, Puzzle, Rocket,
  ShoppingCart, Sparkles, Sprout, Star, Sun, Target, TrendingUp, Users, Wallet, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cx } from "../lib/util";
import { bouncy } from "./primitives";

/** The one icon vocabulary for workspaces, lists, collections and docs. */
export const ICONS = {
  home: Home, briefcase: Briefcase, book: BookOpen, rocket: Rocket, palette: Palette, flask: FlaskConical, idea: Lightbulb,
  study: GraduationCap, tools: Wrench, growth: TrendingUp, game: Gamepad2, travel: Plane, brain: Brain, pen: PenLine, sprout: Sprout,
  star: Star, folder: Folder, inbox: Inbox, cart: ShoppingCart, heart: Heart, code: Code2, music: Music, camera: Camera, doc: FileText,
  calendar: Calendar, target: Target, bolt: Zap, coffee: Coffee, globe: Globe, people: Users, bookmark: Bookmark, flag: Flag,
  box: Package, puzzle: Puzzle, sparkle: Sparkles, feather: Feather, leaf: Leaf, fitness: Dumbbell, wallet: Wallet, sun: Sun,
  archive: Archive, list: ClipboardList, layers: Layers,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

/** Order shown in pickers. */
export const PICKER_ICONS: IconKey[] = [
  "home", "briefcase", "book", "rocket", "code", "palette", "flask", "idea", "study", "tools", "growth", "target",
  "doc", "pen", "calendar", "people", "heart", "music", "camera", "game", "travel", "brain", "sprout", "star",
];

const EMOJI_TO_ICON: Record<string, IconKey> = {
  "🏠": "home", "🏡": "home", "💼": "briefcase", "📚": "book", "📘": "book", "🚀": "rocket", "🎨": "palette", "🧪": "flask", "🔬": "flask",
  "💡": "idea", "🎓": "study", "🛠️": "tools", "📈": "growth", "🎮": "game", "✈️": "travel", "🧠": "brain", "📝": "pen", "🌱": "sprout",
  "⭐": "star", "📁": "folder", "📥": "inbox", "🛒": "cart", "🏃": "bolt", "📄": "doc", "🗓️": "calendar", "☀️": "sun", "🌸": "heart",
};

/** Normalises stored values (including legacy emoji) to a known icon key. */
export function toIcon(v: string | undefined | null, fallback: IconKey): IconKey {
  if (v && v in ICONS) return v as IconKey;
  return (v && EMOJI_TO_ICON[v]) || fallback;
}

/** An icon in a softly tinted rounded square. */
export function Glyph({ name, color, size = 22, className }: { name: string | undefined; color: string; size?: number; className?: string }) {
  const Icon = ICONS[toIcon(name, "folder")];
  return (
    <span
      className={cx("grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        background: `color-mix(in oklab, ${color} 20%, transparent)`,
        color: `color-mix(in oklab, ${color} 82%, white)`,
      }}
    >
      <Icon size={Math.round(size * 0.56)} strokeWidth={2.1} />
    </span>
  );
}

/** Small inline icon for menus and chips (no background). */
export function InlineIcon({ name, color, size = 13 }: { name: string | undefined; color?: string; size?: number }) {
  const Icon = ICONS[toIcon(name, "folder")];
  return <Icon size={size} strokeWidth={2.2} style={color ? { color } : undefined} className="shrink-0" />;
}

export function IconPicker({ value, onPick, color }: { value: string; onPick: (k: IconKey) => void; color: string }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {PICKER_ICONS.map((k) => {
        const Icon = ICONS[k];
        const on = toIcon(value, "folder") === k;
        return (
          <motion.button
            key={k}
            type="button"
            title={k}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.88 }}
            transition={bouncy}
            onClick={() => onPick(k)}
            className={cx("grid h-7 w-7 place-items-center rounded-lg transition-colors", on ? "" : "text-ink-3 hover:bg-white/8 hover:text-ink")}
            style={on ? { background: `color-mix(in oklab, ${color} 24%, transparent)`, color: `color-mix(in oklab, ${color} 85%, white)` } : undefined}
          >
            <Icon size={14} strokeWidth={2.2} />
          </motion.button>
        );
      })}
    </div>
  );
}

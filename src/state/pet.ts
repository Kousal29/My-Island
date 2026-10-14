import { create } from "zustand";
import { persist } from "../lib/persist";
import { bus } from "../lib/bus";
import { play } from "../lib/sound";
import { clamp } from "../lib/util";
import { useLive } from "./live";
import type { PetKind } from "./settings";

export type Pose = "idle" | "happy" | "love" | "eat" | "sleep" | "dance" | "curious" | "yawn" | "walk" | "excited" | "sad" | "held";
export type Accessory = "none" | "bow" | "scarf" | "glasses" | "party" | "crown";
export type Food = "fish" | "bone" | "cookie" | "milk";

export const ACCESSORIES: { id: Accessory; label: string; level: number }[] = [
  { id: "none", label: "None", level: 1 },
  { id: "bow", label: "Bow", level: 2 },
  { id: "scarf", label: "Scarf", level: 3 },
  { id: "glasses", label: "Glasses", level: 5 },
  { id: "party", label: "Party hat", level: 7 },
  { id: "crown", label: "Crown", level: 10 },
];

export const PALETTES: Record<PetKind, { id: string; label: string; body: string; belly: string; ear: string; dark: string; spot?: string }[]> = {
  cat: [
    { id: "ginger", label: "Ginger", body: "#f6a94f", belly: "#ffe3bf", ear: "#ffb3c1", dark: "#c06c22", spot: "#e48a2c" },
    { id: "smoke", label: "Smoke", body: "#9aa3b5", belly: "#e7ebf2", ear: "#ffb3c1", dark: "#5e6678", spot: "#7d879b" },
    { id: "midnight", label: "Midnight", body: "#3a3a48", belly: "#5a5a6c", ear: "#ff9cb3", dark: "#1d1d26", spot: "#2c2c38" },
    { id: "snow", label: "Snow", body: "#f7f4ee", belly: "#ffffff", ear: "#ffc2cf", dark: "#b9b2a6", spot: "#e8e1d4" },
    { id: "calico", label: "Calico", body: "#fff1de", belly: "#ffffff", ear: "#ffb3c1", dark: "#8c5a34", spot: "#e58f3e" },
  ],
  dog: [
    { id: "golden", label: "Golden", body: "#e9b46a", belly: "#fff0d6", ear: "#c98a3f", dark: "#8c5a24" },
    { id: "choco", label: "Choco", body: "#8a5a3c", belly: "#d9b49a", ear: "#5c3a24", dark: "#3d261a" },
    { id: "shiba", label: "Shiba", body: "#e5873e", belly: "#fff6ea", ear: "#c46a26", dark: "#7a3f14" },
    { id: "husky", label: "Husky", body: "#8f9aab", belly: "#ffffff", ear: "#6c7688", dark: "#3c4350" },
    { id: "cream", label: "Cream", body: "#f6eadb", belly: "#ffffff", ear: "#e4cfb5", dark: "#9c8670" },
  ],
};

interface PetState {
  kind: PetKind;
  name: string;
  palette: string;
  accessory: Accessory;
  fullness: number;
  happiness: number;
  energy: number;
  xp: number;
  level: number;
  bornAt: number;
  lastTick: number;
  totalPets: number;
  totalFeeds: number;
  /** The pet is out roaming the desktop in the buddy window. */
  out: boolean;
  // ephemeral
  pose: Pose;
  poseUntil: number;
  bubble: { text: string; until: number } | null;
  particles: { id: number; kind: "heart" | "zzz" | "star" | "note" | "crumb"; until: number }[];
  set: (patch: Partial<PetState>) => void;
}

export const xpForLevel = (level: number) => Math.round(40 * Math.pow(level, 1.45));

export const usePet = create<PetState>((set) => ({
  kind: "cat",
  name: "Mochi",
  palette: "ginger",
  accessory: "none",
  fullness: 80,
  happiness: 80,
  energy: 90,
  xp: 0,
  level: 1,
  bornAt: Date.now(),
  lastTick: Date.now(),
  totalPets: 0,
  totalFeeds: 0,
  out: false,
  pose: "idle",
  poseUntil: 0,
  bubble: null,
  particles: [],
  set: (patch) => set(patch),
}));

export const paletteOf = (kind: PetKind, id: string) => PALETTES[kind].find((p) => p.id === id) ?? PALETTES[kind][0];

let particleId = 0;
export function burst(kind: PetState["particles"][number]["kind"], count = 3, ms = 1600) {
  const until = Date.now() + ms;
  usePet.setState((s) => ({
    particles: [...s.particles.filter((p) => p.until > Date.now()), ...Array.from({ length: count }, () => ({ id: ++particleId, kind, until }))],
  }));
}

export function react(pose: Pose, ms = 2400, bubble?: string) {
  usePet.setState({
    pose,
    poseUntil: Date.now() + ms,
    ...(bubble ? { bubble: { text: bubble, until: Date.now() + Math.max(ms, 2200) } } : {}),
  });
}

export function gainXp(amount: number) {
  const s = usePet.getState();
  let { xp, level } = s;
  xp += amount;
  let leveled = false;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    leveled = true;
  }
  usePet.setState({ xp, level });
  if (leveled) {
    bus.emit("pet:levelup", { level });
    react("excited", 3200, `Level ${level}!`);
    burst("star", 8, 2200);
    play("chime");
  }
}

const voice = () => play(usePet.getState().kind === "cat" ? "meow" : "woof");

let lastPet = 0;
export function petThePet() {
  const now = Date.now();
  const s = usePet.getState();
  if (s.pose === "sleep" && now < s.poseUntil) {
    react("yawn", 1600, "*yawn*… oh hi!");
    usePet.setState({ energy: clamp(s.energy + 5, 0, 100) });
    return;
  }
  usePet.setState({ happiness: clamp(s.happiness + 6, 0, 100), totalPets: s.totalPets + 1 });
  react("love", 1800);
  burst("heart", 3);
  if (now - lastPet > 4000) {
    gainXp(2);
    voice();
  }
  lastPet = now;
  bus.emit("pet:petted", null);
}

export function feed(food: Food) {
  const s = usePet.getState();
  if (s.fullness >= 98) {
    react("sad", 1600, "I'm stuffed!");
    return;
  }
  const amount = { fish: 28, bone: 28, cookie: 14, milk: 18 }[food];
  usePet.setState({
    fullness: clamp(s.fullness + amount, 0, 100),
    happiness: clamp(s.happiness + 4, 0, 100),
    totalFeeds: s.totalFeeds + 1,
  });
  react("eat", 2200);
  burst("crumb", 4, 1200);
  gainXp(3);
  bus.emit("pet:fed", null);
}

export function playWith() {
  const s = usePet.getState();
  if (s.energy < 15) {
    react("yawn", 1800, "Too sleepy…");
    return;
  }
  usePet.setState({ happiness: clamp(s.happiness + 14, 0, 100), energy: clamp(s.energy - 8, 0, 100) });
  react("excited", 2600);
  burst("star", 4);
  gainXp(4);
  voice();
}

export function mood(s: Pick<PetState, "fullness" | "happiness" | "energy">) {
  if (s.energy < 20) return { label: "Sleepy", emoji: "😴" };
  if (s.fullness < 25) return { label: "Hungry", emoji: "🍽️" };
  if (s.happiness < 30) return { label: "Lonely", emoji: "🥺" };
  if (s.happiness > 80 && s.fullness > 60) return { label: "Ecstatic", emoji: "🤩" };
  return { label: "Content", emoji: "😊" };
}

/** Applies stat decay for elapsed time (including while the app was closed). */
function tick() {
  const s = usePet.getState();
  const now = Date.now();
  const mins = (now - s.lastTick) / 60000;
  if (mins < 0.25) return;
  const sleeping = s.pose === "sleep";
  usePet.setState({
    fullness: clamp(s.fullness - mins / 7, 0, 100),
    happiness: clamp(s.happiness - mins / 10, 0, 100),
    energy: clamp(s.energy + (sleeping ? mins * 2.5 : -mins / 9), 0, 100),
    lastTick: now,
  });
}

let lastInteraction = Date.now();
const IDLE_ACTS: [Pose, number, string?][] = [
  ["yawn", 1800],
  ["walk", 5200],
  ["curious", 2200],
  ["happy", 1800],
  ["walk", 4200],
];

/** Picks the pet's pose each second: reactions > music > sleep > idle fidgets. */
export function startPetBrain() {
  const offs = [
    bus.on("todo:completed", () => {
      lastInteraction = Date.now();
      react("happy", 2200, pick(["Nice!", "Yay!", "Done ✓", "Proud of you!"]));
      burst("star", 3);
      gainXp(8);
    }),
    bus.on("timer:done", () => {
      react("excited", 3000, "Time's up!");
      gainXp(12);
    }),
    bus.on("stash:added", () => react("curious", 1600, "Ooh, saved!")),
    bus.on("clip:copied", () => react("curious", 1200)),
    bus.on("media:started", () => {
      burst("note", 3);
    }),
    bus.on("battery:low", () => react("sad", 2600, "Battery low…")),
    bus.on("battery:plugged", () => react("happy", 1600)),
    bus.on("pet:petted", () => (lastInteraction = Date.now())),
    bus.on("pet:fed", () => (lastInteraction = Date.now())),
  ];

  let nextFidget = Date.now() + 9000;
  const loop = setInterval(() => {
    tick();
    const s = usePet.getState();
    const now = Date.now();
    if (s.bubble && s.bubble.until < now) usePet.setState({ bubble: null });
    if (s.particles.length && s.particles.every((p) => p.until < now)) usePet.setState({ particles: [] });
    if (s.poseUntil > now) return;

    const hour = new Date().getHours();
    const nightOwl = (hour >= 1 && hour < 6) && now - lastInteraction > 5 * 60000;
    const bored = now - lastInteraction > 25 * 60000;
    const playing = !!useLive.getState().media?.playing;

    if (s.pose === "sleep" && s.energy < 95 && !playing) return;
    if (s.energy < 12 || nightOwl || (bored && !playing)) {
      usePet.setState({ pose: "sleep", poseUntil: now + 60000 });
      burst("zzz", 2, 3000);
      return;
    }
    if (playing) {
      if (s.pose !== "dance") usePet.setState({ pose: "dance", poseUntil: 0 });
      if (Math.random() < 0.15) burst("note", 1, 1800);
      return;
    }
    if (now > nextFidget) {
      const [pose, ms] = pick(IDLE_ACTS);
      const sad = s.fullness < 20 || s.happiness < 20;
      react(sad ? "sad" : pose, ms, sad ? (s.fullness < 20 ? "I'm hungry…" : "Play with me?") : undefined);
      nextFidget = now + 8000 + Math.random() * 14000;
      return;
    }
    if (s.pose !== "idle") usePet.setState({ pose: "idle", poseUntil: 0 });
  }, 1000);

  return () => {
    clearInterval(loop);
    offs.forEach((f) => f());
  };
}

export function notePetInteraction() {
  lastInteraction = Date.now();
  const s = usePet.getState();
  if (s.pose === "sleep" && s.energy > 30) usePet.setState({ pose: "yawn", poseUntil: Date.now() + 1500 });
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const hydratePet = () =>
  persist(usePet, {
    key: "pet",
    version: 1,
    pick: (s) => ({
      kind: s.kind, name: s.name, palette: s.palette, accessory: s.accessory,
      fullness: Math.round(s.fullness), happiness: Math.round(s.happiness), energy: Math.round(s.energy),
      xp: s.xp, level: s.level, bornAt: s.bornAt, lastTick: s.lastTick, totalPets: s.totalPets, totalFeeds: s.totalFeeds, out: s.out,
    }),
    apply: (d) => d,
  });

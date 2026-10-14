import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Cookie, EyeOff, Home, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ParticleGlyph } from "../pet/Pet";
import { PetSvg, type Palette } from "../pet/PetSvg";
import { paletteOf, type Accessory, type Pose } from "../state/pet";
import type { PetKind } from "../state/settings";

/** Keep in sync with buddy.rs (W, H, HEAD_X, HEAD_Y). */
const W = 150;
const H = 150;
const PET = 100;
const HEAD_X = 75;
const HEAD_Y = 100;
/** Pet scale that matches the head peeking out of the collapsed pill. */
const PILL_SCALE = 0.34;
const G = 2300;
const WALK = 62;
const RUN = 300;

interface Env { scale: number; workLeft: number; workTop: number; workRight: number; workBottom: number; islandX: number; dragging: boolean }
interface Look { kind: PetKind; palette: Palette; accessory: Accessory; name: string; slot: { x: number; y: number } }
type Mode = "parked" | "fall" | "idle" | "walk" | "run" | "sleep" | "held" | "home" | "tucked";
export interface BuddyEvent { type: "petted" | "played" | "fed" | "home" }
interface Dropped { x: number; y: number; vx: number; vy: number; home: boolean }

const send = (e: BuddyEvent) => void emitTo("main", "buddy://event", e);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const move = (x: number, y: number) => void invoke("buddy_move", { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });

export function BuddyApp() {
  const [look, setLook] = useState<Look>({ kind: "cat", palette: paletteOf("cat", "ginger"), accessory: "none", name: "Mochi", slot: { x: 69, y: 17 } });
  const [active, setActive] = useState(false);
  const [pose, setPose] = useState<Pose>("idle");
  const [facing, setFacing] = useState(1);
  const [hover, setHover] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [ring, setRing] = useState(0);
  const [still, setStill] = useState(false);
  const [look2, setLookDir] = useState({ x: 0, y: 0 });
  const squash = useAnimationControls();
  const body = useAnimationControls();
  const box = useRef<HTMLDivElement>(null);

  const gotLook = useRef(false);
  const lookRef = useRef(look);
  lookRef.current = look;
  const env = useRef<Env | null>(null);
  const s = useRef({ x: 0, y: 0, vx: 0, vy: 0, mode: "parked" as Mode, target: 0, speed: WALK, last: Date.now(), music: false, side: 0 as -1 | 0 | 1, tuckAfter: false, fromDrop: false });
  const raf = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const lastClick = useRef(0);
  const press = useRef<{ x: number; y: number } | null>(null);

  const later = (key: string, ms: number, fn: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };
  const floor = () => (env.current ? env.current.workBottom - H : 0);
  const say = (t: string, ms = 1800) => {
    setBubble(t);
    later("bubble", ms, () => setBubble(null));
  };
  /** Animate briefly after anything happens, then freeze into a cheap still pose. */
  const wake = () => {
    setStill(false);
    later("still", 9000, () => (s.current.mode === "idle" || s.current.mode === "sleep") && setStill(true));
  };
  const interact = () => {
    s.current.last = Date.now();
    wake();
  };
  const restPose = () => (s.current.music ? "dance" : "idle");

  // ---------------- physics / movement loop (runs only while something moves) ----------------
  const loop = () => {
    cancelAnimationFrame(raf.current);
    let prev = performance.now();
    const tick = (now: number) => {
      const st = s.current;
      const e = env.current;
      if (!e) return;
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      const minX = e.workLeft;
      const maxX = e.workRight - W;

      if (st.mode === "fall") {
        st.vy += G * dt;
        st.x += st.vx * dt;
        st.y += st.vy * dt;
        if (st.x < minX || st.x > maxX) {
          st.x = Math.min(maxX, Math.max(minX, st.x));
          st.vx = -st.vx * 0.55;
        }
        if (st.y >= floor()) {
          st.y = floor();
          if (st.vy > 650) {
            if (st.vy > 1600) say(pick(["Oof!", "Whoa!", "Wheee!"]), 1200);
            st.vy = -st.vy * 0.32;
            st.vx *= 0.6;
            void squash.start({ scaleY: [0.72, 1.08, 1], scaleX: [1.2, 0.95, 1], transition: { duration: 0.38, ease: "easeOut" } });
          } else {
            st.vy = 0;
            st.vx = 0;
            move(st.x, st.y);
            void squash.start({ scaleY: [0.86, 1.04, 1], scaleX: [1.1, 0.98, 1], transition: { duration: 0.3, ease: "easeOut" } });
            // Only tuck when the user deliberately dropped it at an edge.
            const dropped = st.fromDrop;
            st.fromDrop = false;
            if (dropped && st.x <= minX + 28) tuck(-1);
            else if (dropped && st.x >= maxX - 28) tuck(1);
            else settle();
            return;
          }
        }
      } else if (st.mode === "walk" || st.mode === "run") {
        const dx = st.target - st.x;
        const step = st.speed * dt;
        if (Math.abs(dx) <= step) {
          st.x = st.target;
          move(st.x, st.y);
          if (st.tuckAfter) {
            st.tuckAfter = false;
            tuck(st.target <= e.workLeft + 1 ? -1 : 1);
            return;
          }
          if (st.mode === "run") {
            say(pick(["Hehe!", "Zoom!", "Again!"]), 1300);
            setPose("happy");
            settle(1400);
          } else settle();
          return;
        }
        st.x += Math.sign(dx) * step;
      } else {
        return;
      }
      move(st.x, st.y);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const scheduleIdle = () => {
    later("idle", rand(4500, 12000), () => {
      const st = s.current;
      if (st.mode !== "idle" || !env.current) return;
      if (Date.now() - st.last > 150_000) {
        st.mode = "sleep";
        setPose("sleep");
        wake();
        return;
      }
      if (st.music) {
        setPose("dance");
        wake();
        return scheduleIdle();
      }
      const r = Math.random();
      if (r < 0.62) {
        const e = env.current;
        const span = Math.min(420, (e.workRight - e.workLeft) / 3);
        st.target = Math.min(e.workRight - W, Math.max(e.workLeft, st.x + rand(-span, span)));
        st.speed = WALK;
        st.mode = "walk";
        setFacing(st.target > st.x ? 1 : -1);
        setPose("walk");
        wake();
        loop();
      } else {
        setPose(r < 0.8 ? "yawn" : "curious");
        wake();
        later("pose", r < 0.8 ? 1600 : 2000, () => s.current.mode === "idle" && setPose(restPose()));
        scheduleIdle();
      }
    });
  };

  function settle(holdMs = 0) {
    s.current.mode = "idle";
    if (holdMs) later("pose", holdMs, () => s.current.mode === "idle" && setPose(restPose()));
    else setPose(restPose());
    wake();
    scheduleIdle();
  }

  // ---------------- edge hiding ----------------
  /** Window x that leaves ~40px of the pet peeking in from a screen edge. */
  const tuckX = (side: -1 | 1, peek = 40) => {
    const e = env.current!;
    return side < 0 ? e.workLeft - (125 - peek) : e.workRight - (25 + peek);
  };
  const slideTo = (x: number, ms = 280) => {
    const st = s.current;
    cancelAnimationFrame(raf.current);
    const from = st.x;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      st.x = from + (x - from) * (1 - Math.pow(1 - t, 3));
      move(st.x, st.y);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  function tuck(side: -1 | 1) {
    const st = s.current;
    if (!env.current) return;
    clearTimeout(timers.current.idle);
    st.mode = "tucked";
    st.side = side;
    setPose("curious");
    say(pick(["Peekaboo", "Shh…", "Hiding!"]), 1100);
    void body.start({ rotate: side * -12, transition: { type: "spring", stiffness: 300, damping: 18 } });
    slideTo(tuckX(side));
    wake();
  }
  const untuck = () => {
    const st = s.current;
    const e = env.current;
    const side = st.side || -1;
    st.side = 0;
    st.fromDrop = false;
    void body.start({ rotate: 0, transition: { type: "spring", stiffness: 400, damping: 20 } });
    // Start from just inside the edge (not beyond it, which the wall clamp would bounce back).
    if (e) st.x = side < 0 ? e.workLeft : e.workRight - W;
    st.vx = -side * rand(280, 360);
    st.vy = -460;
    st.mode = "fall";
    setPose("excited");
    say("Boo!", 900);
    interact();
    loop();
  };
  /** Run to the nearest edge and hide there. */
  const hideAtEdge = () => {
    const e = env.current;
    const st = s.current;
    if (!e) return;
    interact();
    const left = st.x - e.workLeft < e.workRight - W - st.x;
    st.target = left ? e.workLeft : e.workRight - W;
    st.speed = RUN;
    st.mode = "run";
    st.tuckAfter = true;
    setFacing(left ? -1 : 1);
    setPose("walk");
    loop();
  };

  // ---------------- choreography ----------------
  /** Pop from pill-size to full size with a springy overshoot and a soft ring. */
  const popIn = () => {
    body.set({ scale: PILL_SCALE, rotate: -14, opacity: 1 });
    void body.start({ scale: 1, rotate: 0, transition: { type: "spring", stiffness: 420, damping: 13, mass: 0.8 } });
    setRing((r) => r + 1);
  };

  const launch = async () => {
    const kind = await invoke<string | null>("buddy_take_launch");
    if (!kind) return;
    const e = await invoke<Env>("buddy_env");
    const pos = await invoke<[number, number] | null>("buddy_pos");
    env.current = e;
    const st = s.current;
    Object.values(timers.current).forEach(clearTimeout);
    cancelAnimationFrame(raf.current);
    if (pos) [st.x, st.y] = pos;
    setActive(true);
    interact();
    popIn();
    if (kind === "held") {
      st.mode = "held";
      setPose("held");
      say(pick(["Wheee!", "Hi!", "Up we go!"]), 1100);
      return;
    }
    // Hop out of the pill towards the side with more room.
    const roomRight = e.workRight - st.x > st.x - e.workLeft;
    st.vx = rand(170, 260) * (roomRight ? 1 : -1);
    st.vy = -420;
    st.mode = "fall";
    setFacing(st.vx > 0 ? 1 : -1);
    setPose("excited");
    say("Hi!", 1200);
    loop();
  };

  /** Fly back into the pill: anticipation squash, arc, shrink to head size, fade into the slot. */
  const goHome = (fromDrop = false) => {
    const e = env.current;
    if (!e || s.current.mode === "home" || s.current.mode === "parked") return;
    const st = s.current;
    Object.values(timers.current).forEach(clearTimeout);
    cancelAnimationFrame(raf.current);
    st.mode = "home";
    setStill(false);
    setPose("excited");
    if (!fromDrop) say("Bye!", 700);

    const { slot } = lookRef.current;
    const from = { x: st.x, y: st.y };
    const to = { x: e.islandX + slot.x - HEAD_X, y: slot.y - HEAD_Y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = fromDrop ? 0.34 : Math.min(0.85, 0.45 + dist / 2600);
    const arc = fromDrop ? 0 : Math.min(160, dist * 0.3);
    setFacing(to.x >= from.x ? 1 : -1);

    const fly = () => {
      void body.start({ scale: PILL_SCALE, rotate: (to.x >= from.x ? 1 : -1) * 16, transition: { duration: dur, ease: [0.5, 0, 0.75, 0] } });
      later("fade", dur * 1000 * 0.78, () => void body.start({ opacity: 0, transition: { duration: dur * 0.22 } }));
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / (dur * 1000));
        const k = easeInOutCubic(t);
        st.x = from.x + (to.x - from.x) * k;
        st.y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * t) * arc;
        move(st.x, st.y);
        if (t < 1) raf.current = requestAnimationFrame(step);
        else {
          st.mode = "parked";
          setActive(false);
          send({ type: "home" });
        }
      };
      raf.current = requestAnimationFrame(step);
    };

    if (fromDrop) fly();
    else {
      void squash.start({ scaleY: 0.8, scaleX: 1.14, transition: { duration: 0.13, ease: "easeOut" } }).then(() => {
        void squash.start({ scaleY: 1.12, scaleX: 0.92, transition: { duration: 0.16 } }).then(() => void squash.start({ scaleY: 1, scaleX: 1 }));
        fly();
      });
    }
  };

  const startZoomies = () => {
    const e = env.current;
    const st = s.current;
    if (!e) return;
    interact();
    st.mode = "run";
    st.speed = RUN;
    const left = st.x - e.workLeft > e.workRight - W - st.x;
    st.target = left ? Math.max(e.workLeft, st.x - rand(220, 520)) : Math.min(e.workRight - W, st.x + rand(220, 520));
    setFacing(st.target > st.x ? 1 : -1);
    setPose("walk");
    send({ type: "played" });
    loop();
  };

  // Listeners call through this ref so they always see the latest closures.
  const handlers = useRef({ launch, goHome, loop, settle, say, wake, slideTo, tuckX });
  handlers.current = { launch, goHome, loop, settle, say, wake, slideTo, tuckX };

  // ---------------- boot ----------------
  useEffect(() => {
    let alive = true;
    document.documentElement.style.background = "transparent";
    const h = () => handlers.current;
    const offs: Promise<() => void>[] = [
      listen<Look>("buddy://pet", (e) => {
        gotLook.current = true;
        setLook(e.payload);
      }),
      listen<boolean>("buddy://hover", (e) => {
        setHover(e.payload);
        const st = s.current;
        if (st.mode === "tucked" && st.side && env.current) h().slideTo(h().tuckX(st.side, e.payload ? 64 : 40), 220);
      }),
      listen("buddy://launch", () => void h().launch()),
      // Cursor position relative to this window (streamed by the native side, throttled).
      listen<[number, number]>("buddy://cursor", (e) => {
        const [x, y] = e.payload;
        const dx = x - HEAD_X;
        const dy = y - (HEAD_Y - 8);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 240);
        setLookDir({ x: (dx / d) * k, y: (dy / d) * k });
      }),
      listen("buddy://home", () => h().goHome()),
      listen<boolean>("buddy://over-island", (e) => {
        if (s.current.mode !== "held") return;
        void body.start({ scale: e.payload ? 0.78 : 1, transition: { type: "spring", stiffness: 500, damping: 22 } });
        setPose(e.payload ? "love" : "held");
      }),
      listen<Dropped>("buddy://dropped", (e) => {
        const st = s.current;
        const { x, y, vx, vy, home } = e.payload;
        st.x = x;
        st.y = y;
        if (home) return h().goHome(true);
        st.fromDrop = true;
        void body.start({ scale: 1, transition: { type: "spring", stiffness: 500, damping: 20 } });
        Object.assign(st, { vx: Math.max(-2600, Math.min(2600, vx)), vy: Math.max(-2600, Math.min(2600, vy)), mode: "fall" as Mode });
        setPose("excited");
        if (Math.hypot(vx, vy) > 1400) h().say("Wheee!", 1100);
        h().loop();
      }),
      listen<{ pose: Pose; bubble?: string }>("buddy://react", (e) => {
        const st = s.current;
        if (st.mode === "held" || st.mode === "home" || st.mode === "parked") return;
        if (st.mode === "sleep") st.mode = "idle";
        setPose(e.payload.pose);
        if (e.payload.bubble) h().say(e.payload.bubble);
        h().wake();
        later("pose", 2200, () => s.current.mode === "idle" && setPose(s.current.music ? "dance" : "idle"));
      }),
      listen<boolean>("buddy://music", (e) => {
        s.current.music = e.payload;
        if (s.current.mode === "idle") {
          setPose(e.payload ? "dance" : "idle");
          h().wake();
        }
      }),
    ];
    let ping: ReturnType<typeof setInterval> | undefined;
    void Promise.all(offs).then(() => {
      if (!alive) return;
      const hello = () => (gotLook.current ? clearInterval(ping) : void emitTo("main", "buddy://ready", null));
      hello();
      ping = setInterval(hello, 400);
      setTimeout(() => clearInterval(ping), 8000);
      // A launch may have been requested before our listener existed.
      void h().launch();
    });
    return () => {
      alive = false;
      clearInterval(ping);
      offs.forEach((p) => void p.then((f) => f()));
      cancelAnimationFrame(raf.current);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  // ---------------- interactive area for the native hit tester ----------------
  useEffect(() => {
    const el = box.current;
    if (!el || !active) return void invoke("set_hit_rect", { rect: null });
    const report = () => {
      const r = el.getBoundingClientRect();
      void invoke("set_hit_rect", { rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hover, active]);

  // ---------------- pointer: click to pet, double-click for zoomies, drag to carry ----------------
  const onPointerDown = (e: React.PointerEvent) => {
    press.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    const st = s.current;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5 || st.mode === "home") return;
    press.current = null;
    cancelAnimationFrame(raf.current);
    clearTimeout(timers.current.idle);
    if (st.mode === "tucked") void body.start({ rotate: 0 });
    st.side = 0;
    st.mode = "held";
    setPose("held");
    interact();
    say(pick(["Hey!", "Wee!", "Up we go!"]), 900);
    void invoke("buddy_drag", { grabX: p.x, grabY: p.y });
  };
  const onPointerUp = () => {
    if (!press.current) return;
    press.current = null;
    const now = Date.now();
    const st = s.current;
    if (st.mode === "home") return;
    if (now - lastClick.current < 320) {
      lastClick.current = 0;
      startZoomies();
      return;
    }
    lastClick.current = now;
    interact();
    if (st.mode === "tucked") {
      untuck();
      return;
    }
    if (st.mode === "sleep") {
      st.mode = "idle";
      setPose("yawn");
      say("*yawn* hi!", 1400);
      later("pose", 1500, () => s.current.mode === "idle" && setPose(restPose()));
      scheduleIdle();
      return;
    }
    if (st.mode === "walk") {
      cancelAnimationFrame(raf.current);
      st.mode = "idle";
    }
    setPose("love");
    setHearts((h) => [...h.slice(-5), now, now + 1, now + 2]);
    void squash.start({ scaleY: [0.92, 1.04, 1], transition: { duration: 0.3 } });
    send({ type: "petted" });
    later("pose", 1600, () => s.current.mode === "idle" && setPose(restPose()));
    scheduleIdle();
  };

  const tool = (label: string, icon: React.ReactNode, run: () => void, i: number) => (
    <motion.button
      key={label}
      title={label}
      initial={{ scale: 0.4, y: 8, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1, transition: { type: "spring", stiffness: 600, damping: 22, delay: i * 0.03 } }}
      exit={{ scale: 0.6, y: 6, opacity: 0, transition: { duration: 0.12 } }}
      whileHover={{ scale: 1.15, y: -2 }}
      whileTap={{ scale: 0.88 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-[#0b0b10]/92 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-white/12"
    >
      {icon}
    </motion.button>
  );

  const sleeping = pose === "sleep";
  const mode = s.current.mode;
  return (
    <div className="relative h-full w-full select-none" style={{ opacity: active ? 1 : 0 }}>
      <div ref={box} className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ width: PET + 20 }}>
        <AnimatePresence>
          {hover && active && mode === "tucked" && (
            <motion.div className="mb-1 flex gap-1">
              {tool("Come out", <Sparkles size={13} />, untuck, 0)}
              {tool("Go home", <Home size={13} />, () => goHome(), 1)}
            </motion.div>
          )}
          {hover && active && mode !== "held" && mode !== "home" && mode !== "tucked" && (
            <motion.div className="mb-1 flex gap-1">
              {tool("Go home", <Home size={13} />, () => goHome(), 0)}
              {tool("Zoomies!", <Sparkles size={13} />, startZoomies, 1)}
              {tool("Hide at edge", <EyeOff size={13} />, hideAtEdge, 4)}
              {tool(
                "Treat",
                <Cookie size={13} />,
                () => {
                  interact();
                  setPose("eat");
                  send({ type: "fed" });
                  later("pose", 2000, () => s.current.mode === "idle" && setPose("happy"));
                  later("pose2", 3200, () => s.current.mode === "idle" && setPose(restPose()));
                },
                2,
              )}
              {sleeping
                ? tool(
                    "Wake up",
                    <Sun size={13} />,
                    () => {
                      s.current.mode = "idle";
                      interact();
                      setPose("yawn");
                      later("pose", 1500, () => setPose(restPose()));
                      scheduleIdle();
                    },
                    3,
                  )
                : tool(
                    "Nap",
                    <Moon size={13} />,
                    () => {
                      clearTimeout(timers.current.idle);
                      cancelAnimationFrame(raf.current);
                      s.current.mode = "sleep";
                      setPose("sleep");
                      wake();
                    },
                    3,
                  )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div animate={body} initial={{ scale: PILL_SCALE, opacity: 0 }} style={{ originX: 0.5, originY: 0.4, width: PET, height: PET * 0.84 }} className="relative">
          <AnimatePresence>
            {ring > 0 && (
              <motion.span
                key={ring}
                initial={{ scale: 0.3, opacity: 0.55 }}
                animate={{ scale: 1.7, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="pointer-events-none absolute top-[40%] left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60"
              />
            )}
          </AnimatePresence>
          <motion.div
            animate={squash}
            style={{ originY: 1 }}
            className="relative h-full w-full cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            whileHover={mode === "idle" || mode === "sleep" ? { scale: 1.04 } : undefined}
          >
            <div className="h-full w-full" style={{ transform: `scaleX(${pose === "walk" || mode === "home" ? facing : 1})` }}>
              <PetSvg
                kind={look.kind}
                pose={pose}
                palette={look.palette}
                accessory={look.accessory}
                look={{ x: look2.x * (pose === "walk" || mode === "home" ? facing : 1), y: look2.y }}
                still={still && (pose === "idle" || pose === "sleep")}
              />
            </div>
          </motion.div>

          <AnimatePresence>
            {hearts.map((h, i) => (
              <motion.span
                key={h}
                initial={{ opacity: 0, y: 0, x: ((i % 3) - 1) * 14, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], y: -54 - (i % 3) * 8, scale: 1 }}
                transition={{ duration: 1.2, delay: (i % 3) * 0.1 }}
                onAnimationComplete={() => setHearts((x) => x.filter((v) => v !== h))}
                className="pointer-events-none absolute top-2 left-1/2"
              >
                <ParticleGlyph kind="heart" size={14} />
              </motion.span>
            ))}
          </AnimatePresence>

          {sleeping && (
            <span className="pointer-events-none absolute -top-1 right-2 font-bold text-[#b9c4ff]" style={{ fontSize: 13, textShadow: "0 0 6px rgba(0,0,0,.7)" }}>
              z<span style={{ fontSize: 10 }}>z</span>
            </span>
          )}

          <AnimatePresence>
            {bubble && (
              <motion.div
                key={bubble}
                initial={{ opacity: 0, scale: 0.5, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="pointer-events-none absolute bottom-[82%] left-[58%] origin-bottom-left rounded-2xl rounded-bl-[4px] bg-white px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[#1f1a26] shadow-lg"
              >
                {bubble}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

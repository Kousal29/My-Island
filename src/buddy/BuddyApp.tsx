import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Cookie, Home, Moon, Sparkles, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PetSvg, type Palette } from "../pet/PetSvg";
import { paletteOf, type Accessory, type Pose } from "../state/pet";
import type { PetKind } from "../state/settings";

/** Keep in sync with buddy.rs W/H. */
const W = 150;
const H = 150;
const PET = 100;
const G = 2300;
const WALK = 62;
const RUN = 300;

interface Env { scale: number; workLeft: number; workTop: number; workRight: number; workBottom: number; islandX: number; dragging: boolean }
interface Look { kind: PetKind; palette: Palette; accessory: Accessory; name: string }
type Mode = "fall" | "idle" | "walk" | "run" | "sleep" | "held" | "home";
export interface BuddyEvent { type: "petted" | "played" | "fed" | "home" }

const send = (e: BuddyEvent) => void emitTo("main", "buddy://event", e);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function BuddyApp() {
  // Default look so the pet is never invisible; the island sends the real one on handshake.
  const [look, setLook] = useState<Look>({ kind: "cat", palette: paletteOf("cat", "ginger"), accessory: "none", name: "Mochi" });
  const gotLook = useRef(false);
  const [pose, setPose] = useState<Pose>("excited");
  const [facing, setFacing] = useState(1);
  const [hover, setHover] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [still, setStill] = useState(false);
  const squash = useAnimationControls();
  const box = useRef<HTMLDivElement>(null);

  const env = useRef<Env | null>(null);
  const s = useRef({ x: 0, y: 0, vx: 0, vy: 0, mode: "fall" as Mode, target: 0, speed: WALK, last: Date.now(), music: false, homeT: 0, from: { x: 0, y: 0 } });
  const raf = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stillTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastClick = useRef(0);
  const press = useRef<{ x: number; y: number } | null>(null);

  const floor = () => (env.current ? env.current.workBottom - H : 0);
  const say = useCallback((t: string, ms = 1800) => {
    setBubble(t);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  /** Animate briefly after anything happens, then freeze into a cheap still pose. */
  const wake = useCallback(() => {
    setStill(false);
    clearTimeout(stillTimer.current);
    stillTimer.current = setTimeout(() => {
      const m = s.current.mode;
      if (m === "idle" || m === "sleep") setStill(true);
    }, 9000);
  }, []);

  const move = (x: number, y: number) => void invoke("buddy_move", { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });

  const loop = useCallback(() => {
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
            if (st.vy > 1600) say(["Oof!", "Whoa!", "Wheee!"][Math.floor(Math.random() * 3)], 1200);
            st.vy = -st.vy * 0.32;
            st.vx *= 0.6;
            void squash.start({ scaleY: [0.72, 1.08, 1], scaleX: [1.2, 0.95, 1], transition: { duration: 0.35 } });
          } else {
            st.vy = 0;
            st.vx = 0;
            void squash.start({ scaleY: [0.86, 1.03, 1], scaleX: [1.1, 0.98, 1], transition: { duration: 0.28 } });
            land();
            return;
          }
        }
      } else if (st.mode === "walk" || st.mode === "run") {
        const dx = st.target - st.x;
        const step = st.speed * dt;
        if (Math.abs(dx) <= step) {
          st.x = st.target;
          move(st.x, st.y);
          if (st.mode === "run") {
            say(["Hehe!", "Zoom!", "Again!"][Math.floor(Math.random() * 3)], 1300);
            setPose("happy");
          }
          settle(st.mode === "run" ? 1400 : 0);
          return;
        }
        st.x += Math.sign(dx) * step;
      } else if (st.mode === "home") {
        st.homeT = Math.min(1, st.homeT + dt / 0.85);
        const t = st.homeT;
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const tx = e.islandX - W / 2;
        st.x = st.from.x + (tx - st.from.x) * ease;
        st.y = st.from.y + (-H * 0.55 - st.from.y) * ease - Math.sin(Math.PI * t) * 140;
        move(st.x, st.y);
        if (t >= 1) {
          send({ type: "home" });
          return;
        }
        raf.current = requestAnimationFrame(tick);
        return;
      } else {
        return;
      }
      move(st.x, st.y);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [say, squash]);

  const scheduleIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const st = s.current;
      if (st.mode !== "idle" || !env.current) return;
      const bored = Date.now() - st.last > 150_000;
      if (bored) {
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
      } else if (r < 0.8) {
        setPose("yawn");
        wake();
        setTimeout(() => s.current.mode === "idle" && setPose("idle"), 1600);
        scheduleIdle();
      } else {
        setPose("curious");
        wake();
        setTimeout(() => s.current.mode === "idle" && setPose("idle"), 2000);
        scheduleIdle();
      }
    }, rand(4500, 12000));
  }, [loop, wake]);

  function settle(holdMs = 0) {
    s.current.mode = "idle";
    setTimeout(() => s.current.mode === "idle" && setPose(s.current.music ? "dance" : "idle"), holdMs);
    if (!holdMs) setPose(s.current.music ? "dance" : "idle");
    wake();
    scheduleIdle();
  }

  function land() {
    settle();
  }

  const interact = () => {
    s.current.last = Date.now();
    wake();
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

  const goHome = () => {
    const st = s.current;
    clearTimeout(idleTimer.current);
    st.mode = "home";
    st.homeT = 0;
    st.from = { x: st.x, y: st.y };
    setPose("excited");
    say("Bye bye!", 900);
    loop();
  };

  // ---- boot ----
  useEffect(() => {
    let alive = true;
    document.documentElement.style.background = "transparent";
    const offs: Promise<() => void>[] = [
      listen<Look>("buddy://pet", (e) => {
        gotLook.current = true;
        setLook(e.payload);
      }),
      listen<boolean>("island://hover", (e) => setHover(e.payload)),
      listen<{ x: number; y: number; vx: number; vy: number }>("buddy://dropped", (e) => {
        const st = s.current;
        const { x, y, vx, vy } = e.payload;
        Object.assign(st, { x, y, vx: Math.max(-2600, Math.min(2600, vx)), vy: Math.max(-2600, Math.min(2600, vy)), mode: "fall" as Mode });
        setPose("excited");
        if (Math.hypot(vx, vy) > 1400) say("Wheee!", 1100);
        loop();
      }),
      listen<{ pose: Pose; bubble?: string }>("buddy://react", (e) => {
        const st = s.current;
        if (st.mode === "held" || st.mode === "home") return;
        if (st.mode === "sleep") st.mode = "idle";
        setPose(e.payload.pose);
        if (e.payload.bubble) say(e.payload.bubble);
        wake();
        setTimeout(() => s.current.mode === "idle" && setPose(s.current.music ? "dance" : "idle"), 2200);
      }),
      listen<boolean>("buddy://music", (e) => {
        s.current.music = e.payload;
        if (s.current.mode === "idle") {
          setPose(e.payload ? "dance" : "idle");
          wake();
        }
      }),
      listen("buddy://home", () => goHome()),
    ];
    // Handshake only after our listeners are registered, and retry until the island answers.
    let ping: ReturnType<typeof setInterval> | undefined;
    void Promise.all(offs).then(() => {
      if (!alive) return;
      const hello = () => (gotLook.current ? clearInterval(ping) : void emitTo("main", "buddy://ready", null));
      hello();
      ping = setInterval(hello, 400);
      setTimeout(() => clearInterval(ping), 8000);
    });
    void invoke<Env>("buddy_env").then(async (e) => {
      if (!alive) return;
      env.current = e;
      const st = s.current;
      const pos = await invoke<[number, number] | null>("buddy_pos");
      if (e.dragging && pos) {
        // Dragged straight out of the island: dangle under the cursor until released.
        [st.x, st.y] = pos;
        st.mode = "held";
        setPose("held");
        say("Wheee!", 1000);
        return;
      }
      st.x = e.islandX - W / 2;
      st.y = 0;
      st.vx = rand(140, 240) * (Math.random() < 0.5 ? -1 : 1);
      st.vy = -260;
      st.mode = "fall";
      setFacing(st.vx > 0 ? 1 : -1);
      say("Hi!", 1200);
      loop();
    });
    return () => {
      alive = false;
      clearInterval(ping);
      offs.forEach((p) => void p.then((f) => f()));
      cancelAnimationFrame(raf.current);
      clearTimeout(idleTimer.current);
    };
  }, []);

  // ---- report interactive area to the native hit tester ----
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      void invoke("set_hit_rect", { rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hover, look]);

  const onPointerDown = (e: React.PointerEvent) => {
    press.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
    press.current = null;
    const st = s.current;
    cancelAnimationFrame(raf.current);
    clearTimeout(idleTimer.current);
    st.mode = "held";
    setPose("held");
    interact();
    say(["Hey!", "Wee!", "Up we go!"][Math.floor(Math.random() * 3)], 900);
    void invoke("buddy_drag", { grabX: p.x, grabY: p.y });
  };
  const onPointerUp = () => {
    if (!press.current) return;
    press.current = null;
    const now = Date.now();
    const st = s.current;
    if (now - lastClick.current < 320) {
      lastClick.current = 0;
      startZoomies();
      return;
    }
    lastClick.current = now;
    interact();
    if (st.mode === "sleep") {
      st.mode = "idle";
      setPose("yawn");
      say("*yawn* hi!", 1400);
      setTimeout(() => s.current.mode === "idle" && setPose("idle"), 1500);
      scheduleIdle();
      return;
    }
    if (st.mode === "walk") {
      cancelAnimationFrame(raf.current);
      st.mode = "idle";
    }
    setPose("love");
    setHearts((h) => [...h.slice(-5), now, now + 1, now + 2]);
    send({ type: "petted" });
    setTimeout(() => s.current.mode === "idle" && setPose("idle"), 1600);
    scheduleIdle();
  };

  const tool = (label: string, icon: React.ReactNode, run: () => void) => (
    <motion.button
      key={label}
      title={label}
      initial={{ scale: 0, y: 6 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0, y: 6 }}
      whileHover={{ scale: 1.18, y: -2 }}
      whileTap={{ scale: 0.85 }}
      transition={{ type: "spring", stiffness: 600, damping: 20 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className="grid h-7 w-7 place-items-center rounded-full bg-[#0b0b10]/92 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-white/12"
    >
      {icon}
    </motion.button>
  );

  const sleeping = pose === "sleep";
  return (
    <div className="relative h-full w-full select-none">
      <div ref={box} className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ width: PET + 20 }}>
        <AnimatePresence>
          {hover && s.current.mode !== "held" && s.current.mode !== "home" && (
            <motion.div className="mb-1 flex gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {tool("Go home", <Home size={13} />, goHome)}
              {tool("Zoomies!", <Sparkles size={13} />, startZoomies)}
              {tool("Treat", <Cookie size={13} />, () => {
                interact();
                setPose("eat");
                send({ type: "fed" });
                setTimeout(() => s.current.mode === "idle" && setPose("happy"), 2000);
                setTimeout(() => s.current.mode === "idle" && setPose("idle"), 3200);
              })}
              {sleeping
                ? tool("Wake up", <Sun size={13} />, () => {
                    s.current.mode = "idle";
                    interact();
                    setPose("yawn");
                    setTimeout(() => setPose("idle"), 1500);
                    scheduleIdle();
                  })
                : tool("Nap", <Moon size={13} />, () => {
                    clearTimeout(idleTimer.current);
                    cancelAnimationFrame(raf.current);
                    s.current.mode = "sleep";
                    setPose("sleep");
                    wake();
                  })}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          animate={squash}
          style={{ originY: 1, width: PET, height: PET * 0.84 }}
          className="relative cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          whileHover={{ scale: 1.04 }}
        >
          <div className="h-full w-full" style={{ transform: `scaleX(${pose === "walk" ? facing : 1})` }}>
            <PetSvg kind={look.kind} pose={pose} palette={look.palette} accessory={look.accessory} still={still && (pose === "idle" || pose === "sleep")} />
          </div>

          <AnimatePresence>
            {hearts.map((h, i) => (
              <motion.span
                key={h}
                initial={{ opacity: 0, y: 0, x: (i % 3 - 1) * 14, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], y: -54 - (i % 3) * 8, scale: 1 }}
                transition={{ duration: 1.2, delay: (i % 3) * 0.1 }}
                onAnimationComplete={() => setHearts((x) => x.filter((v) => v !== h))}
                className="pointer-events-none absolute top-2 left-1/2 text-[14px] text-[#ff5d8f]"
              >
                ❤
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

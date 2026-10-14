import { useSettings } from "../state/settings";

/** Tiny synthesized UI sounds — no audio assets shipped. */
let ctx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number, gain = 0.08, type: OscillatorType = "sine") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

const sounds = {
  pop: () => tone(880, 0, 0.09, 0.05, "triangle"),
  tick: () => tone(1400, 0, 0.03, 0.03, "square"),
  success: () => {
    tone(784, 0, 0.12);
    tone(1175, 0.08, 0.18);
  },
  chime: () => {
    tone(659, 0, 0.5);
    tone(880, 0.15, 0.5);
    tone(1319, 0.3, 0.8);
  },
  meow: () => {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.type = "sawtooth";
    o.frequency.setValueAtTime(700, t);
    o.frequency.linearRampToValueAtTime(1050, t + 0.12);
    o.frequency.linearRampToValueAtTime(600, t + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.45);
  },
  woof: () => {
    tone(260, 0, 0.12, 0.08, "square");
    tone(200, 0.05, 0.12, 0.06, "square");
  },
};

export type SoundName = keyof typeof sounds;

export function play(name: SoundName) {
  if (!useSettings.getState().sounds) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    sounds[name]();
  } catch {}
}

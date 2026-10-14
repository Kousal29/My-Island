import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/bridge";
import { bus } from "../lib/bus";
import { play } from "../lib/sound";
import type { BuddyEvent } from "../buddy/BuddyApp";
import { useIsland } from "./island";
import { useLive } from "./live";
import { burst, feed, paletteOf, petThePet, playWith, react, usePet, type Pose } from "./pet";
import { toast } from "./toast";

const toBuddy = (event: string, payload: unknown) => void emitTo("buddy", event, payload).catch(() => {});

function sendLook() {
  const s = usePet.getState();
  toBuddy("buddy://pet", { kind: s.kind, palette: paletteOf(s.kind, s.palette), accessory: s.accessory, name: s.name });
}

const buddyReact = (pose: Pose, bubble?: string) => usePet.getState().out && toBuddy("buddy://react", { pose, bubble });

/** `grab`: the user is dragging the pet out with the mouse — it stays attached to the cursor. */
export async function letPetOut(grab = false) {
  if (!isTauri || usePet.getState().out) return;
  usePet.setState({ out: true });
  useIsland.getState().collapse();
  play(usePet.getState().kind === "cat" ? "meow" : "woof");
  try {
    await invoke("buddy_open", { grab });
    setTimeout(sendLook, 300);
    setTimeout(sendLook, 1200);
  } catch (e) {
    usePet.setState({ out: false });
    toast("Couldn't let your pet out", undefined, "bad");
    console.error(e);
  }
}

export function callPetHome() {
  if (!usePet.getState().out) return;
  toBuddy("buddy://home", null);
  // Fallback in case the buddy window is gone.
  setTimeout(() => usePet.getState().out && finishHome(), 2500);
}

function finishHome() {
  void invoke("buddy_close").catch(() => {});
  usePet.setState({ out: false });
  react("happy", 2200, "I'm back!");
  burst("heart", 3);
}

export const togglePetOut = () => (usePet.getState().out ? callPetHome() : void letPetOut());

export function startBuddyBridge() {
  if (!isTauri) return () => {};
  const offs: (() => void)[] = [];
  const add = (p: Promise<() => void>) => void p.then((f) => offs.push(f));

  add(listen("buddy://ready", () => {
    sendLook();
    toBuddy("buddy://music", !!useLive.getState().media?.playing);
  }));
  add(
    listen<BuddyEvent>("buddy://event", ({ payload }) => {
      if (payload.type === "petted") petThePet();
      else if (payload.type === "played") playWith();
      else if (payload.type === "fed") feed(usePet.getState().kind === "cat" ? "fish" : "bone");
      else if (payload.type === "home") finishHome();
    }),
  );

  offs.push(
    usePet.subscribe((s, p) => {
      if (s.kind !== p.kind || s.palette !== p.palette || s.accessory !== p.accessory || s.name !== p.name) sendLook();
    }),
    useLive.subscribe((s, p) => {
      if (!!s.media?.playing !== !!p.media?.playing) toBuddy("buddy://music", !!s.media?.playing);
    }),
    bus.on("todo:completed", () => buddyReact("happy", ["Nice!", "Yay!", "Done ✓"][Math.floor(Math.random() * 3)])),
    bus.on("timer:done", () => buddyReact("excited", "Time's up!")),
    bus.on("pet:levelup", ({ level }) => buddyReact("excited", `Level ${level}!`)),
    bus.on("stash:added", () => buddyReact("curious", "Saved!")),
  );

  // Pet was roaming when the app last closed: let it hop out again.
  if (usePet.getState().out) {
    usePet.setState({ out: false });
    setTimeout(() => void letPetOut(), 1500);
  }

  return () => offs.forEach((f) => f());
}

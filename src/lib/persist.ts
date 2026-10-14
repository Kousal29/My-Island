import { load, type Store } from "@tauri-apps/plugin-store";
import type { StoreApi, UseBoundStore } from "zustand";
import { isTauri } from "./bridge";

/**
 * Versioned persistence for zustand slices into a single tauri-plugin-store file.
 * Each slice declares a version and ordered migrations; data is written debounced.
 */
interface Envelope<T> { v: number; data: T }

export interface PersistSpec<S, D> {
  key: string;
  version: number;
  /** migrations[n] upgrades data from version n to n+1 */
  migrations?: Record<number, (old: any) => any>;
  pick: (state: S) => D;
  apply: (data: D) => Partial<S>;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> | null {
  if (!isTauri) return null;
  storePromise ??= load("island.json", { autoSave: false, defaults: {} });
  return storePromise;
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
const dirty = new Map<string, unknown>();

async function flush() {
  const store = await getStore();
  if (!store) {
    dirty.forEach((v, k) => {
      try {
        localStorage.setItem(`island:${k}`, JSON.stringify(v));
      } catch {}
    });
    dirty.clear();
    return;
  }
  for (const [k, v] of dirty) await store.set(k, v);
  dirty.clear();
  await store.save();
}

function schedule(key: string, value: unknown) {
  dirty.set(key, value);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 400);
}

async function read(key: string): Promise<unknown> {
  const store = await getStore();
  if (!store) {
    try {
      const raw = localStorage.getItem(`island:${key}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }
  return store.get(key);
}

const hydrated = new Map<string, Promise<void>>();

export function persist<S, D>(useStore: UseBoundStore<StoreApi<S>>, spec: PersistSpec<S, D>): Promise<void> {
  let p = hydrated.get(spec.key);
  if (!p) hydrated.set(spec.key, (p = hydrate(useStore, spec)));
  return p;
}

async function hydrate<S, D>(useStore: UseBoundStore<StoreApi<S>>, spec: PersistSpec<S, D>) {
  const raw = (await read(spec.key)) as Envelope<any> | undefined;
  if (raw && typeof raw === "object" && "v" in raw) {
    let { v, data } = raw;
    while (v < spec.version) {
      const m = spec.migrations?.[v];
      if (m) data = m(data);
      v++;
    }
    if (v === spec.version) {
      try {
        useStore.setState(spec.apply(data));
      } catch (e) {
        console.error(`failed to hydrate ${spec.key}`, e);
      }
    }
  }
  let prev = spec.pick(useStore.getState());
  useStore.subscribe((state) => {
    const next = spec.pick(state);
    if (shallowEqual(next, prev)) return;
    prev = next;
    schedule(spec.key, { v: spec.version, data: next } satisfies Envelope<D>);
  });
}

function shallowEqual(a: any, b: any) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object") return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

window.addEventListener("beforeunload", () => void flush());

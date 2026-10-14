/** App-wide typed event bus. Modules publish; the pet, activities and sounds subscribe. */
export interface BusEvents {
  "todo:completed": { id: string; title: string };
  "todo:added": { id: string };
  "stash:added": { kind: string };
  "clip:copied": { text: string };
  "timer:done": { label: string };
  "timer:started": { minutes: number };
  "media:started": null;
  "pet:petted": null;
  "pet:fed": null;
  "pet:levelup": { level: number };
  "battery:low": { percent: number };
  "battery:plugged": { percent: number };
}

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof BusEvents, Set<Handler<any>>>();

export const bus = {
  on<K extends keyof BusEvents>(event: K, fn: Handler<BusEvents[K]>): () => void {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  },
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]) {
    handlers.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(`bus handler for ${event} failed`, e);
      }
    });
  },
};

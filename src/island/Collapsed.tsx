import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { MODULE_LIST } from "../modules/registry";
import type { Activity } from "../modules/types";
import { Pet } from "../pet/Pet";
import { useActivities } from "../state/activities";
import { useSettings } from "../state/settings";
import { usePet } from "../state/pet";
import { ChevronUp, PawPrint } from "lucide-react";

export const IDLE_H = 34;

/** Picks the highest-priority live activity: transients beat module activities. */
export function useCurrentActivity(): (Activity & { key: string }) | null {
  const disabled = useSettings((s) => s.disabledModules);
  // Hooks run for every module (fixed order) so enabling/disabling never changes hook count.
  const fromModules = MODULE_LIST.map((m) => ({ id: m.id, a: m.useActivity?.() ?? null }));
  const transients = useActivities((s) => s.transients);
  let best: (Activity & { key: string }) | null = null;
  for (const { id, a } of fromModules) {
    if (a && !disabled.includes(id) && (!best || a.priority > best.priority)) best = { ...a, key: id };
  }
  for (const t of transients) {
    if (!best || t.priority >= best.priority) best = { ...t, key: t.id };
  }
  return best;
}

function ClockText() {
  const [now, setNow] = useState(new Date());
  const clock24 = useSettings((s) => s.home.clock24);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular text-[12.5px] font-semibold text-ink/90">
      {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !clock24 }).replace(/\s?(AM|PM)$/i, "")}
    </span>
  );
}

export function idleWidth(showClock: boolean, showPet: boolean) {
  return showClock || showPet ? 196 : 150;
}

const slot = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -5 },
  transition: { type: "spring", stiffness: 520, damping: 34 },
} as const;

/** ⌃ that slides in on hover: shrinks the island to a slim bar (hover the bar to restore). */
function MinimizeButton() {
  return (
    <motion.button
      key="min"
      initial={{ opacity: 0, width: 0, marginRight: 0 }}
      animate={{ opacity: 1, width: 18, marginRight: 8 }}
      exit={{ opacity: 0, width: 0, marginRight: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.85 }}
      title="Minimize  (Ctrl+Alt+M) — rest the cursor on the bar to bring it back"
      aria-label="Minimize island"
      onClick={(e) => {
        e.stopPropagation();
        useSettings.getState().set({ minimized: true });
      }}
      className="grid h-[18px] shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-ink-2 hover:bg-white/18 hover:text-ink"
    >
      <ChevronUp size={12} strokeWidth={2.6} />
    </motion.button>
  );
}

export function CollapsedContent({ activity, peek }: { activity: (Activity & { key: string }) | null; peek: boolean }) {
  const { showClock, showPetInPill } = useSettings();
  const petOut = usePet((s) => s.out);
  return (
    <div className="flex h-full w-full items-center gap-2.5 px-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {activity ? (
          <motion.div key={activity.key} className="flex h-full min-w-0 flex-1 items-center gap-2.5" {...slot}>
            <AnimatePresence initial={false}>{peek && <MinimizeButton />}</AnimatePresence>
            {activity.left && <div className="flex shrink-0 items-center">{activity.left}</div>}
            <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">{activity.center}</div>
            {activity.right && <div className="flex shrink-0 items-center">{activity.right}</div>}
          </motion.div>
        ) : (
          <motion.div key="idle" className="flex h-full flex-1 items-center justify-between" {...slot}>
            <div className="flex items-center">
              <AnimatePresence initial={false}>
                {peek && <MinimizeButton />}
              </AnimatePresence>
              {showClock && <ClockText />}
            </div>
            <AnimatePresence>
              {peek && (
                <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[10.5px] font-medium text-ink-3">
                  click to open
                </motion.span>
              )}
            </AnimatePresence>
            <div className="-mb-1 flex h-full items-end">
              <AnimatePresence mode="popLayout" initial={false}>
                {showPetInPill && !petOut ? (
                  <motion.div
                    key="pet"
                    initial={{ scale: 0.2, opacity: 0, y: 6 }}
                    animate={{ scale: 1, opacity: 1, y: 0, transition: { type: "spring", stiffness: 520, damping: 13, mass: 0.7 } }}
                    exit={{ scale: 1.4, opacity: 0, transition: { duration: 0.14, ease: "easeOut" } }}
                    style={{ originY: 0.7 }}
                  >
                    <Pet size={34} variant="head" interactive={false} showBubble={false} still dragOut />
                  </motion.div>
                ) : showPetInPill ? (
                  <motion.span key="paw" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="mr-1 mb-2.5 text-ink-3" title="Out exploring">
                    <PawPrint size={13} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

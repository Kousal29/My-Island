import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { MODULE_LIST } from "../modules/registry";
import type { Activity } from "../modules/types";
import { Pet } from "../pet/Pet";
import { useActivities } from "../state/activities";
import { useSettings } from "../state/settings";
import { usePet } from "../state/pet";

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
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular text-[12.5px] font-semibold text-ink/90">
      {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?(AM|PM)$/i, "")}
    </span>
  );
}

export function idleWidth(showClock: boolean, showPet: boolean) {
  return showClock || showPet ? 196 : 150;
}

const slot = {
  initial: { opacity: 0, scale: 0.6, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.6, filter: "blur(4px)" },
  transition: { type: "spring", stiffness: 500, damping: 30 },
} as const;

export function CollapsedContent({ activity, peek }: { activity: (Activity & { key: string }) | null; peek: boolean }) {
  const { showClock, showPetInPill } = useSettings();
  const petOut = usePet((s) => s.out);
  return (
    <div className="flex h-full w-full items-center gap-2.5 px-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {activity ? (
          <motion.div key={activity.key} className="flex h-full min-w-0 flex-1 items-center gap-2.5" {...slot}>
            {activity.left && <div className="flex shrink-0 items-center">{activity.left}</div>}
            <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">{activity.center}</div>
            {activity.right && <div className="flex shrink-0 items-center">{activity.right}</div>}
          </motion.div>
        ) : (
          <motion.div key="idle" className="flex h-full flex-1 items-center justify-between" {...slot}>
            <div className="flex items-center">{showClock && <ClockText />}</div>
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
                  <motion.div key="pet" initial={{ y: 30, scale: 0.6 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.6 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                    <Pet size={34} variant="head" interactive={false} showBubble={false} still dragOut />
                  </motion.div>
                ) : showPetInPill ? (
                  <motion.span key="paw" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="mb-2.5 mr-1 text-[12px] opacity-60" title="Out exploring">
                    🐾
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

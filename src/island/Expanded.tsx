import { AnimatePresence, motion } from "motion/react";
import { Settings, X } from "lucide-react";
import { useRef } from "react";
import { cx } from "../lib/util";
import { MODULES } from "../modules/registry";
import { SettingsView } from "../modules/settings";
import { useIsland } from "../state/island";
import { useSettings } from "../state/settings";
import { useToasts } from "../state/toast";
import { HScroll, IconButton, spring } from "../ui/primitives";
import { WorkspaceSwitcher } from "../ui/workspaces";

export const HEADER_H = 50;
export const PAD = 20;

export function useEnabledModules() {
  const { moduleOrder, disabledModules } = useSettings();
  return moduleOrder.filter((id) => MODULES[id] && !disabledModules.includes(id));
}

function TabBar() {
  const { active, settingsOpen, setActive, set } = useIsland();
  const ids = useEnabledModules();
  return (
    <div className="flex items-center gap-1 px-4 pt-1" style={{ height: HEADER_H }}>
      <WorkspaceSwitcher />
      <div className="mx-1 h-4 w-px shrink-0 bg-white/10" />
      <HScroll className="flex-1" watch={active}>
        {ids.map((id, i) => {
          const m = MODULES[id];
          const on = !settingsOpen && active === id;
          const Icon = m.icon;
          return (
            <motion.button
              key={id}
              data-active={on ? "true" : undefined}
              onClick={() => setActive(id)}
              whileTap={{ scale: 0.9 }}
              title={`${m.title} (${i + 1})`}
              className={cx("focus-ring relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors", on ? "text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              {on && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 rounded-full bg-white/11 ring-1 ring-white/8" />}
              <motion.span className="relative" animate={on ? { rotate: [0, -12, 10, 0], scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.45 }}>
                <Icon size={15} />
              </motion.span>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.span
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={spring}
                    className="relative overflow-hidden whitespace-nowrap"
                  >
                    {m.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </HScroll>
      <IconButton label="Settings (Ctrl+,)" size="sm" active={settingsOpen} onClick={() => set({ settingsOpen: !settingsOpen })}>
        <motion.span animate={{ rotate: settingsOpen ? 90 : 0 }} transition={spring}>
          <Settings size={15} />
        </motion.span>
      </IconButton>
      <IconButton label="Close (Esc)" size="sm" onClick={() => useIsland.getState().collapse()}>
        <X size={15} />
      </IconButton>
    </div>
  );
}

function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex flex-col items-center gap-1.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={spring}
            className={cx(
              "pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-3.5 text-[12px] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.8)] ring-1 backdrop-blur-xl",
              t.tone === "bad" ? "bg-[#2a1418]/95 text-bad ring-bad/25" : "bg-panel-3/95 text-ink ring-white/10",
            )}
          >
            {t.text}
            {t.action ? (
              <button
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11.5px] font-semibold text-black"
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ExpandedContent({ width, height }: { width: number; height: number }) {
  const { active, settingsOpen } = useIsland();
  const ids = useEnabledModules();
  const prev = useRef(active);
  const dir = ids.indexOf(active) >= ids.indexOf(prev.current) ? 1 : -1;
  prev.current = active;
  const key = settingsOpen ? "settings" : active;
  const View = settingsOpen ? SettingsView : (MODULES[active] ?? MODULES.home).View;

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width, height }}>
      <TabBar />
      <div className="relative" style={{ height: height - HEADER_H }}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={key}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: 18 * d }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: -18 * d }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
            style={{ padding: `0 ${PAD}px ${PAD}px` }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
        <Toaster />
      </div>
    </div>
  );
}

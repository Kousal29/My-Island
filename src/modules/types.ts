import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Content a module shows inside the collapsed island while something is "live". */
export interface Activity {
  /** Higher wins. Transients use 70+; media 40; timer 50. */
  priority: number;
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  /** Collapsed width in px while this activity is shown. */
  width?: number;
  /** Module to open when the collapsed island is clicked. */
  opens?: string;
}

export interface IslandModule {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Expanded island size in px. */
  size: { w: number; h: number };
  View: ComponentType;
  /** Hook evaluated every render of the collapsed island; return null when idle. */
  useActivity?: () => Activity | null;
  /** Shown in settings so users know what the module does. */
  description: string;
}

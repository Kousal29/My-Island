import { alertsModule } from "./alerts";
import { homeModule } from "./home";
import { mediaModule } from "./media";
import { petModule } from "./pet";
import { stashModule } from "./stash";
import { statsModule } from "./stats";
import { timerModule } from "./timer";
import { todosModule } from "./todos";
import { wellnessModule } from "./wellness";
import type { IslandModule } from "./types";

/** Every island module. To add one, implement IslandModule and register it here. */
const ALL: IslandModule[] = [homeModule, mediaModule, todosModule, stashModule, timerModule, wellnessModule, alertsModule, statsModule, petModule];

export const MODULES: Record<string, IslandModule> = Object.fromEntries(ALL.map((m) => [m.id, m]));
export const MODULE_LIST = ALL;

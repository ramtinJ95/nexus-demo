import type { Journey } from "../journey.ts";
import { coreLoop } from "./core-loop.ts";
import { gameFeel } from "./game-feel.ts";
import { leaderboardApi } from "./leaderboard-api.ts";
import { titleSettings } from "./title-settings.ts";

export const journeys: Record<string, Journey> = {
  "core-loop": coreLoop,
  "game-feel": gameFeel,
  "leaderboard-api": leaderboardApi,
  "title-settings": titleSettings,
};

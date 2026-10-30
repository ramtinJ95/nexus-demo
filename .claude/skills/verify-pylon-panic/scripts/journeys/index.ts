import type { Journey } from "../journey.ts";
import { coreLoop } from "./core-loop.ts";
import { leaderboard } from "./leaderboard.ts";
import { leaderboardApi } from "./leaderboard-api.ts";

export const journeys: Record<string, Journey> = {
  "core-loop": coreLoop,
  leaderboard,
  "leaderboard-api": leaderboardApi,
};

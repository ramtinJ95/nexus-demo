import type { Journey } from "../journey.ts";
import { coreLoop } from "./core-loop.ts";
import { leaderboardApi } from "./leaderboard-api.ts";

export const journeys: Record<string, Journey> = {
  "core-loop": coreLoop,
  "leaderboard-api": leaderboardApi,
};

import type { Journey } from "../journey.ts";
import { coreLoop } from "./core-loop.ts";
import { enemyDasher, enemyShielded, enemySplitter } from "./enemy-variety.ts";
import { gameFeel } from "./game-feel.ts";
import { leaderboardApi } from "./leaderboard-api.ts";

export const journeys: Record<string, Journey> = {
  "core-loop": coreLoop,
  "enemy-dasher": enemyDasher,
  "enemy-splitter": enemySplitter,
  "enemy-shielded": enemyShielded,
  "game-feel": gameFeel,
  "leaderboard-api": leaderboardApi,
};

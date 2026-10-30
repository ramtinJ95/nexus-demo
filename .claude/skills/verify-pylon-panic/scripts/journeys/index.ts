import type { Journey } from "../journey.ts";
import { coreLoop } from "./core-loop.ts";
import { enemyDasher, enemyShielded, enemySplitter } from "./enemy-variety.ts";
import { gameFeel } from "./game-feel.ts";
import { leaderboard } from "./leaderboard.ts";
import { leaderboardApi } from "./leaderboard-api.ts";
import { touchLandscape, touchPortrait } from "./touch-controls.ts";

export const journeys: Record<string, Journey> = {
  "core-loop": coreLoop,
  "enemy-dasher": enemyDasher,
  "enemy-splitter": enemySplitter,
  "enemy-shielded": enemyShielded,
  "game-feel": gameFeel,
  leaderboard,
  "leaderboard-api": leaderboardApi,
  "touch-portrait": touchPortrait,
  "touch-landscape": touchLandscape,
};

import type { EnemyKind } from "./types";

export type EnemyType = {
  radius: number;
  speed: number;
  hp: number;
  drainPerSecond: number;
  color: string;
  legs: number;
  /** Visual leg wiggle in radians. */
  jitter: number;
  /** Earliest wave this kind spawns in. */
  firstWave: number;
};

export const enemyTypes: Record<EnemyKind, EnemyType> = {
  crawler: { radius: 13, speed: 60, hp: 2, drainPerSecond: 2, color: "#7dff4f", legs: 6, jitter: 0.45, firstWave: 1 },
};

import type { EnemyKind } from "./types";

export type DashBehavior = {
  /** The drone must be this close for a dasher to wind up. */
  range: number;
  stalkSeconds: number;
  windupSeconds: number;
  lungeSeconds: number;
  lungeSpeed: number;
  /** Knockback speed given to the drone on contact, in px/s. */
  shove: number;
};

/** Optional behavior entries define the behavior by their presence. */
export type EnemyType = {
  radius: number;
  speed: number;
  hp: number;
  drainPerSecond: number;
  color: string;
  legs: number;
  /** Visual leg wiggle in radians. */
  jitter: number;
  /** Earliest wave this kind spawns in. Null: waves never spawn it. */
  firstWave: number | null;
  /** Relative odds among the kinds eligible for a wave. */
  spawnWeight: number;
  /** HUD hint shown during this kind's debut wave. */
  intro?: string;
  dash?: DashBehavior;
  splitsInto?: { kind: EnemyKind; count: number };
  shield?: true;
};

export const enemyTypes: Record<EnemyKind, EnemyType> = {
  crawler: { radius: 13, speed: 60, hp: 2, drainPerSecond: 2, color: "#7dff4f", legs: 6, jitter: 0.45, firstWave: 1, spawnWeight: 3 },
  dasher: {
    radius: 12,
    speed: 70,
    hp: 2,
    drainPerSecond: 2,
    color: "#ffb02e",
    legs: 4,
    jitter: 0.3,
    firstWave: 2,
    spawnWeight: 1,
    intro: "pauses, then lunges",
    dash: { range: 300, stalkSeconds: 1.6, windupSeconds: 0.55, lungeSeconds: 0.5, lungeSpeed: 620, shove: 560 },
  },
  splitter: {
    radius: 17,
    speed: 48,
    hp: 3,
    drainPerSecond: 3,
    color: "#b46bff",
    legs: 8,
    jitter: 0.35,
    firstWave: 3,
    spawnWeight: 1,
    intro: "splits in two",
    splitsInto: { kind: "splitling", count: 2 },
  },
  splitling: { radius: 8, speed: 92, hp: 1, drainPerSecond: 1, color: "#e0b3ff", legs: 4, jitter: 0.6, firstWave: null, spawnWeight: 0 },
  shielded: {
    radius: 15,
    speed: 42,
    hp: 3,
    drainPerSecond: 3,
    color: "#4fa8ff",
    legs: 6,
    jitter: 0.3,
    firstWave: 4,
    spawnWeight: 1,
    intro: "hit it from behind",
    shield: true,
  },
};

export const enemyKinds = Object.keys(enemyTypes) as EnemyKind[];

/** The kind whose first wave is `wave`, if any. */
export function debutKind(wave: number): EnemyKind | undefined {
  return enemyKinds.find((k) => enemyTypes[k].firstWave === wave);
}

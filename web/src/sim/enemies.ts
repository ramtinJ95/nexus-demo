import type { Bug, EnemyKind } from "./types";

export type DashBehavior = {
  /** The drone must be this close for a dasher to wind up. */
  range: number;
  stalkSeconds: number;
  windupSeconds: number;
  lungeSeconds: number;
  lungeSpeed: number;
  /** Knockback speed given to the drone on contact, in px/s. */
  shove: number;
  /** The charge direction is fixed when the windup starts, so the windup is a telegraph the player can step out of. */
  locksAim?: true;
};

export type BossPhase = 1 | 2;

export type BossBehavior = {
  /** Phase 2 starts once hp is at or below this fraction of max hp. */
  enrageAt: number;
  phases: Record<BossPhase, { charge: DashBehavior; brood?: { kind: EnemyKind; count: number; everySeconds: number } }>;
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
  boss?: BossBehavior;
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
  boss: {
    radius: 34,
    speed: 38,
    hp: 40,
    drainPerSecond: 10,
    color: "#ff3355",
    legs: 8,
    jitter: 0.25,
    firstWave: null,
    spawnWeight: 0,
    boss: {
      enrageAt: 0.5,
      phases: {
        1: { charge: { range: 2000, stalkSeconds: 2.2, windupSeconds: 1, lungeSeconds: 0.7, lungeSpeed: 560, shove: 720, locksAim: true } },
        2: {
          charge: { range: 2000, stalkSeconds: 1.2, windupSeconds: 0.6, lungeSeconds: 0.6, lungeSpeed: 720, shove: 820, locksAim: true },
          brood: { kind: "splitling", count: 3, everySeconds: 3.5 },
        },
      },
    },
  },
};

/** Derived from hp, so the phase can never disagree with the health bar. */
export function bossPhase(bug: Extract<Bug, { kind: "boss" }>): BossPhase {
  const boss = enemyTypes.boss.boss!;
  return bug.hp / enemyTypes.boss.hp <= boss.enrageAt ? 2 : 1;
}

export const enemyKinds = Object.keys(enemyTypes) as EnemyKind[];

/** The kind whose first wave is `wave`, if any. */
export function debutKind(wave: number): EnemyKind | undefined {
  return enemyKinds.find((k) => enemyTypes[k].firstWave === wave);
}

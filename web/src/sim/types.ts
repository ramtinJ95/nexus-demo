export type Vec = { x: number; y: number };

/** What the player is doing during one tick. Aim is a point in arena coordinates. */
export type InputFrame = {
  move: Vec;
  aim: Vec;
  fire: boolean;
};

export type EnemyKind = "crawler";

export type Drone = { pos: Vec; aim: Vec; cooldown: number };

export type Bug = { id: number; kind: EnemyKind; pos: Vec; hp: number; latched: boolean };

export type Bullet = { id: number; pos: Vec; vel: Vec; ttl: number };

/** A wave is either spawning bugs or resting before the next wave begins. */
export type WaveState =
  | { phase: "spawning"; number: number; remaining: number; nextSpawnIn: number }
  | { phase: "resting"; number: number; nextWaveIn: number };

export type Phase = "playing" | "gameOver";

export type GameState = {
  seed: number;
  rng: number;
  tick: number;
  phase: Phase;
  drone: Drone;
  integrity: number;
  bugs: Bug[];
  bullets: Bullet[];
  wave: WaveState;
  kills: number;
  wavesSurvived: number;
  nextId: number;
};

/** Emitted by `step` so the shell, and later features, react to the run without polling state. */
export type GameEvent =
  | { type: "waveStarted"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "shotFired"; pos: Vec; dir: Vec }
  | { type: "bugHit"; id: number; kind: EnemyKind; pos: Vec }
  | { type: "bugKilled"; kind: EnemyKind; pos: Vec }
  | { type: "pylonHit"; integrity: number }
  | { type: "gameOver"; score: number; wave: number; kills: number };

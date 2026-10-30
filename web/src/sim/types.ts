export type Vec = { x: number; y: number };

/** What the player is doing during one tick. Aim is a point in arena coordinates. */
export type InputFrame = {
  move: Vec;
  aim: Vec;
  fire: boolean;
};

export type EnemyKind = "crawler" | "dasher" | "splitter" | "splitling" | "shielded" | "boss";

/** `shove` is a knockback velocity in px/s that decays each tick. */
export type Drone = { pos: Vec; aim: Vec; cooldown: number; shove: Vec };

/** A dasher stalks the pylon, stops to wind up when the drone is near, then lunges in a straight line. */
export type Dash =
  | { phase: "stalk"; left: number }
  | { phase: "windup"; left: number }
  | { phase: "lunge"; left: number; dir: Vec };

/** `facing` is a unit vector. A shielded bug's shield covers its front half. */
type BugBody = { id: number; pos: Vec; hp: number; latched: boolean; facing: Vec };
/** `broodIn` is seconds until the boss's next brood; it only counts down once the boss enrages. */
export type Bug =
  | (BugBody & { kind: Exclude<EnemyKind, "dasher" | "boss"> })
  | (BugBody & { kind: "dasher"; dash: Dash })
  | (BugBody & { kind: "boss"; dash: Dash; broodIn: number });

export type Bullet = { id: number; pos: Vec; vel: Vec; ttl: number };

/** A wave spawns bugs, then on boss waves fights the boss, then rests before the next wave begins. */
export type WaveState =
  | { phase: "spawning"; number: number; remaining: number; nextSpawnIn: number }
  | { phase: "boss"; number: number }
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
  | { type: "droneHit"; pos: Vec }
  | { type: "shieldBlocked"; pos: Vec }
  | { type: "bossSpawned"; wave: number; pos: Vec }
  | { type: "bossEnraged"; pos: Vec }
  | { type: "gameOver"; score: number; wave: number; kills: number };

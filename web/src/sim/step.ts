import { enemyTypes, type EnemyType } from "./enemies";
import { nextRandom } from "./rng";
import type { Settings } from "./settings";
import type { Bug, EnemyKind, GameEvent, GameState, InputFrame, Vec } from "./types";

const enemyKinds = Object.keys(enemyTypes) as EnemyKind[];

export function createGame(seed: number, settings: Settings): GameState {
  const { width, height } = settings.arena;
  return {
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    phase: "playing",
    drone: { pos: { x: width / 2, y: height / 2 + 110 }, aim: { x: 0, y: -1 }, cooldown: 0 },
    integrity: settings.pylon.maxIntegrity,
    bugs: [],
    bullets: [],
    wave: { phase: "resting", number: 1, nextWaveIn: settings.waves.firstWaveDelay },
    kills: 0,
    wavesSurvived: 0,
    nextId: 1,
  };
}

export function score(state: GameState): number {
  return state.kills + state.wavesSurvived;
}

function bugsInWave(wave: number, settings: Settings): number {
  return settings.waves.firstWaveBugs + (wave - 1) * settings.waves.extraBugsPerWave;
}

function spawnInterval(wave: number, settings: Settings): number {
  const { firstSpawnInterval, spawnIntervalFactor, minSpawnInterval } = settings.waves;
  return Math.max(minSpawnInterval, firstSpawnInterval * spawnIntervalFactor ** (wave - 1));
}

export function pylonCenter(settings: Settings): Vec {
  return { x: settings.arena.width / 2, y: settings.arena.height / 2 };
}

/** Advances the run by one fixed tick of 1 / ticksPerSecond seconds, mutating `state`. */
export function step(state: GameState, input: InputFrame, settings: Settings): GameEvent[] {
  if (state.phase === "gameOver") return [];
  const dt = 1 / settings.ticksPerSecond;
  const events: GameEvent[] = [];
  state.tick++;

  moveDrone(state, input, settings, dt);
  fire(state, input, settings, dt);
  advanceWave(state, settings, dt, events);
  moveBugs(state, settings, dt, events);
  moveBullets(state, settings, dt, events);
  drainPylon(state, dt);

  if (state.integrity <= 0) {
    state.integrity = 0;
    state.phase = "gameOver";
    events.push({ type: "gameOver", score: score(state), wave: state.wave.number, kills: state.kills });
    return events;
  }

  const wave = state.wave;
  if (wave.phase === "spawning" && wave.remaining === 0 && state.bugs.length === 0) {
    state.wavesSurvived++;
    events.push({ type: "waveCleared", wave: wave.number });
    state.wave = { phase: "resting", number: wave.number + 1, nextWaveIn: settings.waves.restSeconds };
  }
  return events;
}

function moveDrone(state: GameState, input: InputFrame, settings: Settings, dt: number): void {
  const { drone } = state;
  const r = settings.drone.radius;
  drone.pos.x = clamp(drone.pos.x + input.move.x * settings.drone.speed * dt, r, settings.arena.width - r);
  drone.pos.y = clamp(drone.pos.y + input.move.y * settings.drone.speed * dt, r, settings.arena.height - r);
  const dx = input.aim.x - drone.pos.x;
  const dy = input.aim.y - drone.pos.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) drone.aim = { x: dx / len, y: dy / len };
}

function fire(state: GameState, input: InputFrame, settings: Settings, dt: number): void {
  const { drone } = state;
  drone.cooldown = Math.max(0, drone.cooldown - dt);
  if (!input.fire || drone.cooldown > 0) return;
  drone.cooldown = settings.drone.fireCooldown;
  const muzzle = settings.drone.radius + 6;
  state.bullets.push({
    id: state.nextId++,
    pos: { x: drone.pos.x + drone.aim.x * muzzle, y: drone.pos.y + drone.aim.y * muzzle },
    vel: { x: drone.aim.x * settings.bullet.speed, y: drone.aim.y * settings.bullet.speed },
    ttl: settings.bullet.ttl,
  });
}

function advanceWave(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const wave = state.wave;
  if (wave.phase === "resting") {
    wave.nextWaveIn -= dt;
    if (wave.nextWaveIn > 0) return;
    state.wave = { phase: "spawning", number: wave.number, remaining: bugsInWave(wave.number, settings), nextSpawnIn: 0 };
    events.push({ type: "waveStarted", wave: wave.number });
    return;
  }
  wave.nextSpawnIn -= dt;
  while (wave.remaining > 0 && wave.nextSpawnIn <= 0) {
    state.bugs.push(spawnBug(state, wave.number, settings));
    wave.remaining--;
    wave.nextSpawnIn += spawnInterval(wave.number, settings);
  }
}

function spawnBug(state: GameState, wave: number, settings: Settings): Bug {
  const { width, height } = settings.arena;
  const eligible = enemyKinds.filter((k) => enemyTypes[k].firstWave <= wave);
  const kind = eligible[Math.floor(nextRandom(state) * eligible.length)] ?? "crawler";
  let t = nextRandom(state) * 2 * (width + height);
  let pos: Vec;
  if (t < width) pos = { x: t, y: 0 };
  else if ((t -= width) < height) pos = { x: width, y: t };
  else if ((t -= height) < width) pos = { x: width - t, y: height };
  else pos = { x: 0, y: height - (t - width) };
  return { id: state.nextId++, kind, pos, hp: enemyTypes[kind].hp, latched: false };
}

function moveBugs(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const center = pylonCenter(settings);
  const speedScale = 1 + (state.wave.number - 1) * settings.waves.speedGrowthPerWave;
  for (const bug of state.bugs) {
    if (bug.latched) continue;
    const type: EnemyType = enemyTypes[bug.kind];
    const dx = center.x - bug.pos.x;
    const dy = center.y - bug.pos.y;
    const dist = Math.hypot(dx, dy);
    const reach = settings.pylon.radius + type.radius;
    const travel = type.speed * speedScale * dt;
    if (dist - travel <= reach) {
      bug.pos = { x: center.x - (dx / dist) * reach, y: center.y - (dy / dist) * reach };
      bug.latched = true;
      events.push({ type: "pylonHit", integrity: state.integrity });
    } else {
      bug.pos.x += (dx / dist) * travel;
      bug.pos.y += (dy / dist) * travel;
    }
  }
}

function moveBullets(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const { width, height } = settings.arena;
  const survivors = [];
  for (const bullet of state.bullets) {
    bullet.pos.x += bullet.vel.x * dt;
    bullet.pos.y += bullet.vel.y * dt;
    bullet.ttl -= dt;
    const outside = bullet.pos.x < 0 || bullet.pos.x > width || bullet.pos.y < 0 || bullet.pos.y > height;
    if (bullet.ttl <= 0 || outside) continue;
    const target = state.bugs.find((bug) => {
      const reach = enemyTypes[bug.kind].radius + settings.bullet.radius;
      return bug.hp > 0 && (bug.pos.x - bullet.pos.x) ** 2 + (bug.pos.y - bullet.pos.y) ** 2 <= reach * reach;
    });
    if (!target) {
      survivors.push(bullet);
      continue;
    }
    target.hp -= settings.bullet.damage;
    if (target.hp <= 0) {
      state.kills++;
      events.push({ type: "bugKilled", kind: target.kind, pos: { ...target.pos } });
    }
  }
  state.bullets = survivors;
  state.bugs = state.bugs.filter((bug) => bug.hp > 0);
}

function drainPylon(state: GameState, dt: number): void {
  for (const bug of state.bugs) {
    if (bug.latched) state.integrity -= enemyTypes[bug.kind].drainPerSecond * dt;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

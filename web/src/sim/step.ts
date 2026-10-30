import { debutKind, enemyKinds, enemyTypes, type EnemyType } from "./enemies";
import { nextRandom } from "./rng";
import type { Settings } from "./settings";
import type { Bug, EnemyKind, GameEvent, GameState, InputFrame, Vec } from "./types";

export function createGame(seed: number, settings: Settings): GameState {
  const { width, height } = settings.arena;
  return {
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    phase: "playing",
    drone: { pos: { x: width / 2, y: height / 2 + 110 }, aim: { x: 0, y: -1 }, cooldown: 0, shove: { x: 0, y: 0 } },
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
  fire(state, input, settings, dt, events);
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
  const vx = input.move.x * settings.drone.speed + drone.shove.x;
  const vy = input.move.y * settings.drone.speed + drone.shove.y;
  drone.pos.x = clamp(drone.pos.x + vx * dt, r, settings.arena.width - r);
  drone.pos.y = clamp(drone.pos.y + vy * dt, r, settings.arena.height - r);
  const decay = Math.exp(-settings.drone.shoveDamping * dt);
  drone.shove = { x: drone.shove.x * decay, y: drone.shove.y * decay };
  const dx = input.aim.x - drone.pos.x;
  const dy = input.aim.y - drone.pos.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) drone.aim = { x: dx / len, y: dy / len };
}

function fire(state: GameState, input: InputFrame, settings: Settings, dt: number, events: GameEvent[]): void {
  const { drone } = state;
  drone.cooldown = Math.max(0, drone.cooldown - dt);
  if (!input.fire || drone.cooldown > 0) return;
  drone.cooldown = settings.drone.fireCooldown;
  const muzzle = settings.drone.radius + 6;
  const pos = { x: drone.pos.x + drone.aim.x * muzzle, y: drone.pos.y + drone.aim.y * muzzle };
  state.bullets.push({
    id: state.nextId++,
    pos,
    vel: { x: drone.aim.x * settings.bullet.speed, y: drone.aim.y * settings.bullet.speed },
    ttl: settings.bullet.ttl,
  });
  events.push({ type: "shotFired", pos: { ...pos }, dir: { ...drone.aim } });
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
    const first = wave.remaining === bugsInWave(wave.number, settings);
    const bug = spawnBug(state, wave.number, first, settings);
    state.bugs.push(bug);
    wave.remaining = Math.max(0, wave.remaining - bodies(bug.kind));
    wave.nextSpawnIn += spawnInterval(wave.number, settings);
  }
}

function spawnBug(state: GameState, wave: number, first: boolean, settings: Settings): Bug {
  const { width, height } = settings.arena;
  const roll = nextRandom(state);
  const kind = (first && debutKind(wave)) || pickKind(roll, wave);
  let t = nextRandom(state) * 2 * (width + height);
  let pos: Vec;
  if (t < width) pos = { x: t, y: 0 };
  else if ((t -= width) < height) pos = { x: width, y: t };
  else if ((t -= height) < width) pos = { x: width - t, y: height };
  else pos = { x: 0, y: height - (t - width) };
  const facing = unit(pylonCenter(settings), pos);
  const dash = enemyTypes[kind].dash;
  return newBug(state, kind, pos, facing, dash ? dash.stalkSeconds * (0.5 + nextRandom(state)) : 0);
}

/** A wave's size counts every body a spawn will become, so splitters don't swell a wave past the next one. */
function bodies(kind: EnemyKind): number {
  const into = enemyTypes[kind].splitsInto;
  return 1 + (into ? into.count * bodies(into.kind) : 0);
}

/** Picks by spawnWeight among the kinds whose first wave has arrived. */
function pickKind(roll: number, wave: number): EnemyKind {
  const eligible = enemyKinds.filter((k) => {
    const firstWave = enemyTypes[k].firstWave;
    return firstWave !== null && firstWave <= wave;
  });
  const total = eligible.reduce((sum, k) => sum + enemyTypes[k].spawnWeight, 0);
  let pick = roll * total;
  for (const k of eligible) {
    pick -= enemyTypes[k].spawnWeight;
    if (pick < 0) return k;
  }
  return eligible[eligible.length - 1] ?? "crawler";
}

function newBug(state: GameState, kind: EnemyKind, pos: Vec, facing: Vec, stalkLeft: number): Bug {
  const body = { id: state.nextId++, pos, hp: enemyTypes[kind].hp, latched: false, facing };
  if (kind === "dasher") return { ...body, kind, dash: { phase: "stalk", left: stalkLeft } };
  return { ...body, kind };
}

function moveBugs(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const speedScale = 1 + (state.wave.number - 1) * settings.waves.speedGrowthPerWave;
  for (const bug of state.bugs) {
    if (bug.latched) continue;
    const type: EnemyType = enemyTypes[bug.kind];
    if (bug.kind === "dasher" && type.dash) moveDasher(state, bug, type, type.dash, speedScale, settings, dt, events);
    else crawl(state, bug, type, speedScale, settings, dt, events);
  }
}

function crawl(state: GameState, bug: Bug, type: EnemyType, speedScale: number, settings: Settings, dt: number, events: GameEvent[]): void {
  const center = pylonCenter(settings);
  const dx = center.x - bug.pos.x;
  const dy = center.y - bug.pos.y;
  const dist = Math.hypot(dx, dy);
  const reach = settings.pylon.radius + type.radius;
  const travel = type.speed * speedScale * dt;
  bug.facing = { x: dx / dist, y: dy / dist };
  if (dist - travel <= reach) {
    latch(state, bug, reach, settings, events);
  } else {
    bug.pos.x += (dx / dist) * travel;
    bug.pos.y += (dy / dist) * travel;
  }
}

function latch(state: GameState, bug: Bug, reach: number, settings: Settings, events: GameEvent[]): void {
  const center = pylonCenter(settings);
  const toBug = unit(bug.pos, center);
  bug.pos = { x: center.x + toBug.x * reach, y: center.y + toBug.y * reach };
  bug.latched = true;
  events.push({ type: "pylonHit", integrity: state.integrity });
}

function moveDasher(
  state: GameState,
  bug: Extract<Bug, { kind: "dasher" }>,
  type: EnemyType,
  dash: NonNullable<EnemyType["dash"]>,
  speedScale: number,
  settings: Settings,
  dt: number,
  events: GameEvent[],
): void {
  const { drone } = state;
  const d = bug.dash;
  if (d.phase === "stalk") {
    d.left = Math.max(0, d.left - dt);
    const near = Math.hypot(drone.pos.x - bug.pos.x, drone.pos.y - bug.pos.y) <= dash.range;
    if (d.left === 0 && near) {
      bug.dash = { phase: "windup", left: dash.windupSeconds };
      bug.facing = unit(drone.pos, bug.pos);
    } else {
      crawl(state, bug, type, speedScale, settings, dt, events);
    }
    return;
  }
  if (d.phase === "windup") {
    bug.facing = unit(drone.pos, bug.pos);
    d.left -= dt;
    if (d.left <= 0) bug.dash = { phase: "lunge", left: dash.lungeSeconds, dir: { ...bug.facing } };
    return;
  }
  const travel = dash.lungeSpeed * speedScale * dt;
  const r = type.radius;
  bug.facing = d.dir;
  bug.pos = {
    x: clamp(bug.pos.x + d.dir.x * travel, r, settings.arena.width - r),
    y: clamp(bug.pos.y + d.dir.y * travel, r, settings.arena.height - r),
  };
  const center = pylonCenter(settings);
  const reach = settings.pylon.radius + r;
  if (Math.hypot(center.x - bug.pos.x, center.y - bug.pos.y) <= reach) {
    latch(state, bug, reach, settings, events);
    bug.dash = { phase: "stalk", left: dash.stalkSeconds };
    return;
  }
  if (Math.hypot(drone.pos.x - bug.pos.x, drone.pos.y - bug.pos.y) <= settings.drone.radius + r) {
    drone.shove = { x: d.dir.x * dash.shove, y: d.dir.y * dash.shove };
    events.push({ type: "droneHit", pos: { ...drone.pos } });
    bug.dash = { phase: "stalk", left: dash.stalkSeconds };
    return;
  }
  d.left -= dt;
  if (d.left <= 0) bug.dash = { phase: "stalk", left: dash.stalkSeconds };
}

function moveBullets(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const { width, height } = settings.arena;
  const survivors = [];
  const children: Bug[] = [];
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
    const type = enemyTypes[target.kind];
    if (type.shield && bullet.vel.x * target.facing.x + bullet.vel.y * target.facing.y <= 0) {
      events.push({ type: "shieldBlocked", pos: { ...bullet.pos } });
      continue;
    }
    target.hp -= settings.bullet.damage;
    events.push({ type: "bugHit", id: target.id, kind: target.kind, pos: { ...bullet.pos } });
    if (target.hp <= 0) {
      state.kills++;
      events.push({ type: "bugKilled", kind: target.kind, pos: { ...target.pos } });
      if (type.splitsInto) children.push(...split(state, target, type.splitsInto));
    }
  }
  state.bullets = survivors;
  state.bugs = state.bugs.filter((bug) => bug.hp > 0).concat(children);
}

/** Children line up across the parent's facing, one radius plus a gap apart from the center. */
function split(state: GameState, parent: Bug, into: NonNullable<EnemyType["splitsInto"]>): Bug[] {
  const child = enemyTypes[into.kind];
  const across = { x: -parent.facing.y, y: parent.facing.x };
  const spacing = 2 * (child.radius + 2);
  return Array.from({ length: into.count }, (_, i) => {
    const offset = (i - (into.count - 1) / 2) * spacing;
    const pos = { x: parent.pos.x + across.x * offset, y: parent.pos.y + across.y * offset };
    return newBug(state, into.kind, pos, { ...parent.facing }, child.dash?.stalkSeconds ?? 0);
  });
}

function drainPylon(state: GameState, dt: number): void {
  for (const bug of state.bugs) {
    if (bug.latched) state.integrity -= enemyTypes[bug.kind].drainPerSecond * dt;
  }
}

/** Unit vector pointing from `from` to `to`. Coincident points face up. */
function unit(to: Vec, from: Vec): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 0, y: -1 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

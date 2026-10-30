import { bossPhase, debutKind, enemyKinds, enemyTypes, type BossBehavior, type BossPhase, type DashBehavior, type EnemyType } from "./enemies";
import { nextRandom } from "./rng";
import type { Settings } from "./settings";
import type { Bug, Dash, EnemyKind, GameEvent, GameState, InputFrame, Vec } from "./types";

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
  if (wave.phase === "resting" || state.bugs.length > 0 || (wave.phase === "spawning" && wave.remaining > 0)) return events;
  if (wave.phase === "spawning" && wave.number % settings.waves.bossEvery === 0) {
    const pos = edgePoint(state, settings);
    state.bugs.push(newBug(state, "boss", pos, unit(pylonCenter(settings), pos), enemyTypes.boss.boss!.phases[1].charge.stalkSeconds));
    state.wave = { phase: "boss", number: wave.number };
    events.push({ type: "bossSpawned", wave: wave.number, pos: { ...pos } });
  } else {
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
  if (wave.phase === "boss") return;
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
  const roll = nextRandom(state);
  const kind = (first && debutKind(wave)) || pickKind(roll, wave);
  const pos = edgePoint(state, settings);
  const facing = unit(pylonCenter(settings), pos);
  const dash = enemyTypes[kind].dash;
  return newBug(state, kind, pos, facing, dash ? dash.stalkSeconds * (0.5 + nextRandom(state)) : 0);
}

/** A seeded point on the arena's border. */
function edgePoint(state: GameState, settings: Settings): Vec {
  const { width, height } = settings.arena;
  let t = nextRandom(state) * 2 * (width + height);
  if (t < width) return { x: t, y: 0 };
  if ((t -= width) < height) return { x: width, y: t };
  if ((t -= height) < width) return { x: width - t, y: height };
  return { x: 0, y: height - (t - width) };
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
  if (kind === "boss") return { ...body, kind, dash: { phase: "stalk", left: stalkLeft }, broodIn: 0 };
  return { ...body, kind };
}

function moveBugs(state: GameState, settings: Settings, dt: number, events: GameEvent[]): void {
  const speedScale = 1 + (state.wave.number - 1) * settings.waves.speedGrowthPerWave;
  const brood: Bug[] = [];
  for (const bug of state.bugs) {
    const type: EnemyType = enemyTypes[bug.kind];
    const phase = bug.kind === "boss" ? type.boss?.phases[bossPhase(bug)] : undefined;
    if (bug.kind === "boss" && phase?.brood) brood.push(...hatch(state, bug, phase.brood, settings, dt));
    if (bug.latched) continue;
    const charge = phase?.charge ?? type.dash;
    if ("dash" in bug && charge) moveDasher(state, bug, type, charge, speedScale, settings, dt, events);
    else crawl(state, bug, type, speedScale, settings, dt, events);
  }
  state.bugs.push(...brood);
}

/** The brood bursts out in a ring around the boss, kept inside the arena so every bug can be shot. */
function hatch(
  state: GameState,
  boss: Extract<Bug, { kind: "boss" }>,
  brood: NonNullable<BossBehavior["phases"][BossPhase]["brood"]>,
  settings: Settings,
  dt: number,
): Bug[] {
  boss.broodIn -= dt;
  if (boss.broodIn > 0) return [];
  boss.broodIn = brood.everySeconds;
  const child = enemyTypes[brood.kind];
  const ring = enemyTypes.boss.radius + child.radius + 2;
  const start = Math.atan2(boss.facing.y, boss.facing.x);
  const center = pylonCenter(settings);
  return Array.from({ length: brood.count }, (_, i) => {
    const angle = start + (2 * Math.PI * i) / brood.count;
    const pos = {
      x: clamp(boss.pos.x + Math.cos(angle) * ring, child.radius, settings.arena.width - child.radius),
      y: clamp(boss.pos.y + Math.sin(angle) * ring, child.radius, settings.arena.height - child.radius),
    };
    return newBug(state, brood.kind, pos, unit(center, pos), child.dash?.stalkSeconds ?? 0);
  });
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
  bug: Extract<Bug, { dash: Dash }>,
  type: EnemyType,
  dash: DashBehavior,
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
    if (!dash.locksAim) bug.facing = unit(drone.pos, bug.pos);
    d.left -= dt;
    if (d.left <= 0) bug.dash = { phase: "lunge", left: dash.lungeSeconds, dir: { ...bug.facing } };
    return;
  }
  const travel = dash.lungeSpeed * speedScale * dt;
  const r = type.radius;
  bug.facing = d.dir;
  const room = dash.locksAim ? roomAlong(bug.pos, d.dir, r, settings) : Infinity;
  const stride = Math.min(travel, room);
  bug.pos = {
    x: clamp(bug.pos.x + d.dir.x * stride, r, settings.arena.width - r),
    y: clamp(bug.pos.y + d.dir.y * stride, r, settings.arena.height - r),
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
  if (d.left <= 0 || stride < travel) bug.dash = { phase: "stalk", left: dash.stalkSeconds };
}

/** How far `pos` can travel along the unit vector `dir` before a body of radius `r` meets a wall. A locked charge stops there instead of sliding along the wall out of its telegraphed lane. */
function roomAlong(pos: Vec, dir: Vec, r: number, settings: Settings): number {
  const { width, height } = settings.arena;
  const tx = dir.x > 1e-9 ? (width - r - pos.x) / dir.x : dir.x < -1e-9 ? (r - pos.x) / dir.x : Infinity;
  const ty = dir.y > 1e-9 ? (height - r - pos.y) / dir.y : dir.y < -1e-9 ? (r - pos.y) / dir.y : Infinity;
  return Math.max(0, Math.min(tx, ty));
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
    const calm = target.kind === "boss" && bossPhase(target) === 1;
    target.hp -= settings.bullet.damage;
    events.push({ type: "bugHit", id: target.id, kind: target.kind, pos: { ...bullet.pos } });
    if (calm && target.kind === "boss" && bossPhase(target) === 2) events.push({ type: "bossEnraged", pos: { ...target.pos } });
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

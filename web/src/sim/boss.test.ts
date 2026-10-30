import { describe, expect, it } from "vitest";
import { enemyTypes } from "./enemies";
import { defaultSettings, type Settings } from "./settings";
import { createGame, pylonCenter, step } from "./step";
import type { Bug, GameEvent, GameState, InputFrame, Vec } from "./types";

const settings = defaultSettings;
const tps = settings.ticksPerSecond;
const sturdy: Settings = { ...settings, pylon: { ...settings.pylon, maxIntegrity: 1e9 } };
const calm: Settings = { ...sturdy, waves: { ...sturdy.waves, firstWaveDelay: 1e9 } };
const atPylon = { x: pylonCenter(calm).x - calm.pylon.radius - enemyTypes.boss.radius, y: pylonCenter(calm).y };

const still = (aim: Vec): InputFrame => ({ move: { x: 0, y: 0 }, aim, fire: false });
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const dir = (to: Vec, from: Vec) => ({ x: (to.x - from.x) / dist(to, from), y: (to.y - from.y) / dist(to, from) });

/** Flies to the outer side of the bug nearest the pylon and shoots it. */
function flank(state: GameState, s: Settings): InputFrame {
  const center = pylonCenter(s);
  const target = state.bugs.toSorted((a, b) => dist(a.pos, center) - dist(b.pos, center))[0];
  if (!target) return still(center);
  const out = dist(target.pos, center);
  const spot = { x: target.pos.x + ((target.pos.x - center.x) / out) * 90, y: target.pos.y + ((target.pos.y - center.y) / out) * 90 };
  const off = { x: spot.x - state.drone.pos.x, y: spot.y - state.drone.pos.y };
  const len = Math.hypot(off.x, off.y);
  const move = len > 1 ? { x: (off.x / len) * Math.min(1, len / 10), y: (off.y / len) * Math.min(1, len / 10) } : { x: 0, y: 0 };
  return { move, aim: target.pos, fire: true };
}

function placeBoss(state: GameState, pos: Vec, stalkLeft: number): Extract<Bug, { kind: "boss" }> {
  const boss: Extract<Bug, { kind: "boss" }> = {
    id: state.nextId++,
    kind: "boss",
    pos,
    hp: enemyTypes.boss.hp,
    latched: false,
    facing: dir(pylonCenter(calm), pos),
    dash: { phase: "stalk", left: stalkLeft },
    broodIn: 0,
  };
  state.bugs.push(boss);
  return boss;
}

type Logged = { tick: number; event: GameEvent };

function play(state: GameState, s: Settings, until: (state: GameState) => boolean, policy: (state: GameState) => InputFrame): Logged[] {
  const log: Logged[] = [];
  while (!until(state) && state.tick < 900 * tps) {
    for (const event of step(state, policy(state), s)) log.push({ tick: state.tick, event });
  }
  return log;
}

/** Ticks spent in windup, from the first windup tick until the lunge starts. */
function windupTicks(state: GameState, boss: Extract<Bug, { kind: "boss" }>): number {
  let ticks = 0;
  while (boss.dash.phase !== "lunge" && state.tick < 10 * tps) {
    step(state, still(state.drone.pos), calm);
    if (boss.dash.phase === "windup") ticks++;
  }
  return ticks;
}

describe("boss bug", () => {
  it("ends every fifth wave once the field is clear, and the wave clears only after the boss dies", () => {
    const state = createGame(5, sturdy);
    const fieldAtBoss = new Map<number, Bug["kind"][]>();
    const bossWave = new Map<number, number>();
    const regular = new Map<number, { wave: number; diedAt?: number }>();
    const log: Logged[] = [];
    while (state.wavesSurvived < 10 && state.tick < 900 * tps) {
      for (const event of step(state, flank(state, sturdy), sturdy)) {
        log.push({ tick: state.tick, event });
        if (event.type === "bossSpawned") fieldAtBoss.set(event.wave, state.bugs.map((b) => b.kind));
      }
      const alive = new Set(state.bugs.map((b) => b.id));
      for (const [id, r] of regular) if (r.diedAt === undefined && !alive.has(id)) r.diedAt = state.tick;
      for (const bug of state.bugs) {
        if (bug.kind === "boss" && !bossWave.has(bug.id)) bossWave.set(bug.id, state.wave.number);
        if (bug.kind !== "boss" && state.wave.phase === "spawning" && !regular.has(bug.id)) regular.set(bug.id, { wave: state.wave.number });
      }
    }
    expect(state.wavesSurvived).toBe(10);

    expect([...bossWave.values()]).toEqual([5, 10]);
    expect(log.filter((l) => l.event.type === "bossSpawned").map((l) => l.event.type === "bossSpawned" && l.event.wave)).toEqual([5, 10]);
    expect(fieldAtBoss.get(5)).toEqual(["boss"]);
    expect(fieldAtBoss.get(10)).toEqual(["boss"]);

    for (const wave of [5, 10]) {
      const spawned = log.find((l) => l.event.type === "bossSpawned" && l.event.wave === wave)!.tick;
      const deaths = [...regular.values()].filter((r) => r.wave === wave).map((r) => r.diedAt!);
      expect(deaths.length, `wave ${wave}`).toBeGreaterThan(0);
      expect(Math.max(...deaths), `wave ${wave}`).toBeLessThanOrEqual(spawned);
      const bossDeath = log.findIndex((l) => l.tick > spawned && l.event.type === "bugKilled" && l.event.kind === "boss");
      const cleared = log.findIndex((l) => l.event.type === "waveCleared" && l.event.wave === wave);
      expect(bossDeath, `wave ${wave}`).toBeGreaterThan(0);
      expect(cleared, `wave ${wave}`).toBeGreaterThan(bossDeath);
    }
  });

  it("stops to wind up, holds still, then charges where it aimed when the windup began", () => {
    const state = createGame(1, calm);
    const boss = placeBoss(state, { x: 200, y: 150 }, 0.25);
    state.drone.pos = { x: 560, y: 150 };

    const start = { ...boss.pos };
    while (boss.dash.phase === "stalk") step(state, still(state.drone.pos), calm);
    expect(dist(boss.pos, start)).toBeGreaterThan(0);
    const aimed = dir(state.drone.pos, boss.pos);
    const windupAt = { ...boss.pos };

    const down = { move: { x: 0, y: 1 }, aim: boss.pos, fire: false };
    const events: GameEvent[] = [];
    while (boss.dash.phase === "windup") {
      events.push(...step(state, down, calm));
      if (boss.dash.phase === "windup") expect(boss.pos).toEqual(windupAt);
    }
    expect(dist(state.drone.pos, { x: 560, y: 150 })).toBeGreaterThan(200);

    let prev = { ...boss.pos };
    let charged = 0;
    while (boss.dash.phase === "lunge") {
      events.push(...step(state, still(boss.pos), calm));
      const moved = dist(boss.pos, prev);
      if (moved > 0) {
        charged += moved;
        expect(((boss.pos.x - prev.x) * aimed.x + (boss.pos.y - prev.y) * aimed.y) / moved).toBeGreaterThan(0.999);
      }
      prev = { ...boss.pos };
    }
    expect(charged).toBeGreaterThan(200);
    expect(events.some((e) => e.type === "droneHit")).toBe(false);
  });

  it("a charge that reaches the drone shoves it along the charge", () => {
    const state = createGame(1, calm);
    const boss = placeBoss(state, { x: 200, y: 150 }, 0);
    state.drone.pos = { x: 500, y: 150 };
    const log = play(state, calm, (st) => st.drone.shove.x !== 0, (st) => still(st.drone.pos));
    expect(log.filter((l) => l.event.type === "droneHit")).toHaveLength(1);
    expect(boss.dash.phase).toBe("stalk");
    const atHit = { ...state.drone.pos };
    for (let i = 0; i < tps / 2; i++) step(state, still(state.drone.pos), calm);
    expect(state.drone.pos.x - atHit.x).toBeGreaterThan(30);
  });

  it("enrages once at half health and only then starts hatching splitlings", () => {
    const state = createGame(1, calm);
    state.wave = { phase: "boss", number: 5 };
    const boss = placeBoss(state, atPylon, 1e9);
    boss.latched = true;
    const seen = new Set([boss.id]);
    const hatchedAt: number[] = [];
    const log: Logged[] = [];
    while (state.bugs.length > 0 && state.tick < 120 * tps) {
      for (const event of step(state, flank(state, calm), calm)) log.push({ tick: state.tick, event });
      for (const bug of state.bugs) {
        if (seen.has(bug.id)) continue;
        seen.add(bug.id);
        expect(bug.kind).toBe("splitling");
        hatchedAt.push(state.tick);
      }
    }

    const enraged = log.filter((l) => l.event.type === "bossEnraged");
    expect(enraged).toHaveLength(1);
    const at = enraged[0]!.tick;
    const bossHits = log.filter((l) => l.event.type === "bugHit" && l.event.kind === "boss");
    expect(bossHits.findIndex((l) => l.tick === at)).toBe(enemyTypes.boss.hp / 2 - 1);

    expect(hatchedAt.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...hatchedAt)).toBeGreaterThan(at);
  });

  it("winds up faster once enraged", () => {
    const calmState = createGame(1, calm);
    const calmBoss = placeBoss(calmState, { x: 200, y: 150 }, 0);
    calmState.drone.pos = { x: 500, y: 150 };
    const enragedState = createGame(1, calm);
    const enragedBoss = placeBoss(enragedState, { x: 200, y: 150 }, 0);
    enragedState.drone.pos = { x: 500, y: 150 };
    enragedBoss.hp = enemyTypes.boss.hp / 2;

    const before = windupTicks(calmState, calmBoss);
    const after = windupTicks(enragedState, enragedBoss);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("dies to gunfire as a boss kill, and the wave clears once its brood is gone", () => {
    const state = createGame(1, calm);
    state.wave = { phase: "boss", number: 5 };
    const boss = placeBoss(state, atPylon, 1e9);
    boss.latched = true;
    const log = play(state, calm, (st) => st.wave.phase === "resting", (st) => flank(st, calm));

    const killed = log.findIndex((l) => l.event.type === "bugKilled" && l.event.kind === "boss");
    const cleared = log.findIndex((l) => l.event.type === "waveCleared");
    expect(killed).toBeGreaterThanOrEqual(0);
    expect(log[cleared]?.event).toEqual({ type: "waveCleared", wave: 5 });
    expect(cleared).toBeGreaterThan(killed);
    expect(state.wavesSurvived).toBe(1);
    expect(state.wave).toMatchObject({ phase: "resting", number: 6 });
  });
});

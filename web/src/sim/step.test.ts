import { describe, expect, it } from "vitest";
import { enemyTypes } from "./enemies";
import { defaultSettings, type Settings } from "./settings";
import { createGame, pylonCenter, score, step } from "./step";
import type { GameEvent, GameState, InputFrame } from "./types";

const settings = defaultSettings;
const tps = settings.ticksPerSecond;

function idle(state: GameState): InputFrame {
  return { move: { x: 0, y: 0 }, aim: { x: state.drone.pos.x, y: state.drone.pos.y - 100 }, fire: false };
}

/** Holds position and shoots the bug closest to the pylon, leading it slightly. */
function turret(state: GameState, s: Settings): InputFrame {
  const center = pylonCenter(s);
  const target = state.bugs.toSorted(
    (a, b) => Math.hypot(a.pos.x - center.x, a.pos.y - center.y) - Math.hypot(b.pos.x - center.x, b.pos.y - center.y),
  )[0];
  if (!target) return idle(state);
  return { move: { x: 0, y: 0 }, aim: target.pos, fire: true };
}

function run(state: GameState, ticks: number, s: Settings, policy: (st: GameState) => InputFrame): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, policy(state), s));
  return events;
}

function scripted(tick: number): InputFrame {
  const angle = tick / 40;
  return {
    move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) * 0.6 },
    aim: { x: 640 + Math.cos(angle * 3) * 400, y: 360 + Math.sin(angle * 3) * 300 },
    fire: tick % 90 < 60,
  };
}

describe("determinism", () => {
  it("replays identically from the same seed and inputs", () => {
    const a = createGame(1234, settings);
    const b = createGame(1234, settings);
    const eventsA = run(a, 3000, settings, (st) => scripted(st.tick));
    const eventsB = run(b, 3000, settings, (st) => scripted(st.tick));
    expect(eventsA.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(eventsB).toEqual(eventsA);
  });

  it("diverges for a different seed", () => {
    const a = createGame(1, settings);
    const b = createGame(2, settings);
    run(a, 10 * tps, settings, idle);
    run(b, 10 * tps, settings, idle);
    expect(a.bugs.length).toBeGreaterThan(0);
    expect(b.bugs.map((bug) => bug.pos)).not.toEqual(a.bugs.map((bug) => bug.pos));
  });
});

describe("drone", () => {
  it("moves at its configured speed", () => {
    const state = createGame(7, settings);
    const start = { ...state.drone.pos };
    const right = { move: { x: 1, y: 0 }, aim: { x: 0, y: 0 }, fire: false };
    for (let i = 0; i < tps / 2; i++) step(state, right, settings);
    expect(state.drone.pos.x - start.x).toBeCloseTo(settings.drone.speed / 2, 6);
    expect(state.drone.pos.y).toBe(start.y);
  });

  it("stays inside the arena", () => {
    const state = createGame(7, settings);
    const upLeft = { move: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, aim: { x: 0, y: 0 }, fire: false };
    for (let i = 0; i < 10 * tps; i++) step(state, upLeft, settings);
    expect(state.drone.pos).toEqual({ x: settings.drone.radius, y: settings.drone.radius });
    const downRight = { move: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, aim: { x: 0, y: 0 }, fire: false };
    for (let i = 0; i < 10 * tps; i++) step(state, downRight, settings);
    expect(state.drone.pos).toEqual({
      x: settings.arena.width - settings.drone.radius,
      y: settings.arena.height - settings.drone.radius,
    });
  });
});

describe("combat", () => {
  it("shooting a bug kills it and raises the score", () => {
    const state = createGame(99, settings);
    const events = run(state, 6 * tps, settings, (st) => turret(st, settings));
    const kills = events.filter((e) => e.type === "bugKilled");
    expect(kills.length).toBeGreaterThan(0);
    expect(kills[0]).toMatchObject({ type: "bugKilled", kind: "crawler" });
    expect(state.kills).toBe(kills.length);
    expect(score(state)).toBe(kills.length);
  });

  it("latched bugs drain integrity each second until shot", () => {
    const oneBug: Settings = { ...settings, waves: { ...settings.waves, firstWaveBugs: 1 } };
    const state = createGame(5, oneBug);
    const events: GameEvent[] = [];
    while (!events.some((e) => e.type === "pylonHit")) events.push(...step(state, idle(state), oneBug));
    expect(state.bugs[0]?.latched).toBe(true);
    const before = state.integrity;
    run(state, 2 * tps, oneBug, idle);
    expect(before - state.integrity).toBeCloseTo(2 * enemyTypes.crawler.drainPerSecond, 6);

    run(state, 2 * tps, oneBug, (st) => turret(st, oneBug));
    expect(state.bugs).toHaveLength(0);
    const afterKill = state.integrity;
    run(state, tps, oneBug, idle);
    expect(state.integrity).toBe(afterKill);
  });
});

describe("fx events", () => {
  const calm: Settings = { ...settings, waves: { ...settings.waves, firstWaveDelay: 1e9 } };

  it("emits one shotFired per bullet, from the muzzle along the aim", () => {
    const state = createGame(8, calm);
    const seen = new Set<number>();
    const events: GameEvent[] = [];
    for (let i = 0; i < tps; i++) {
      events.push(...step(state, { ...idle(state), fire: true }, calm));
      for (const b of state.bullets) seen.add(b.id);
    }
    const shots = events.filter((e) => e.type === "shotFired");
    expect(shots.length).toBeGreaterThan(1);
    expect(shots.length).toBe(seen.size);
    const muzzle = calm.drone.radius + 6;
    expect(shots[0]).toEqual({
      type: "shotFired",
      pos: { x: state.drone.pos.x, y: state.drone.pos.y - muzzle },
      dir: { x: 0, y: -1 },
    });
  });

  it("emits bugHit for every hit and bugKilled on the lethal one", () => {
    const state = createGame(8, calm);
    const { x, y } = state.drone.pos;
    state.bugs.push({ id: 999, kind: "crawler", pos: { x, y: y - 200 }, hp: enemyTypes.crawler.hp, latched: false });
    const events: GameEvent[] = [];
    while (!events.some((e) => e.type === "bugKilled") && state.tick < 3 * tps) {
      const bug = state.bugs[0]!;
      events.push(...step(state, { move: { x: 0, y: 0 }, aim: bug.pos, fire: true }, calm));
    }
    const fx = events.filter((e) => e.type === "bugHit" || e.type === "bugKilled");
    expect(fx.map((e) => e.type)).toEqual([...Array(enemyTypes.crawler.hp).fill("bugHit"), "bugKilled"]);
    expect(fx[0]).toMatchObject({ type: "bugHit", id: 999, kind: "crawler" });
    expect(state.bugs).toHaveLength(0);
  });
});

describe("game over", () => {
  it("fires once and freezes the sim", () => {
    const state = createGame(3, settings);
    const events = run(state, 120 * tps, settings, idle);
    const overs = events.filter((e) => e.type === "gameOver");
    expect(overs).toEqual([{ type: "gameOver", score: score(state), wave: 1, kills: 0 }]);
    expect(state.phase).toBe("gameOver");
    expect(state.integrity).toBe(0);

    const frozen = structuredClone(state);
    const later = run(state, 5 * tps, settings, (st) => scripted(st.tick));
    expect(later).toEqual([]);
    expect(state).toEqual(frozen);
  });

  it("an idle player loses within 15 to 30 seconds", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createGame(seed, settings);
      let ticks = 0;
      while (state.phase === "playing" && ticks < 120 * tps) {
        step(state, idle(state), settings);
        ticks++;
      }
      const seconds = ticks / tps;
      expect(seconds, `seed ${seed}`).toBeGreaterThanOrEqual(15);
      expect(seconds, `seed ${seed}`).toBeLessThanOrEqual(30);
    }
  });
});

describe("waves", () => {
  it("each wave spawns more bugs than the last, and clearing one counts toward score", () => {
    const sturdy: Settings = { ...settings, pylon: { ...settings.pylon, maxIntegrity: 1e9 } };
    const state = createGame(11, sturdy);
    const spawnedPerWave = new Map<number, Set<number>>();
    const events: GameEvent[] = [];
    while (state.wavesSurvived < 4 && state.tick < 600 * tps) {
      events.push(...step(state, turret(state, sturdy), sturdy));
      const seen = spawnedPerWave.get(state.wave.number) ?? new Set<number>();
      for (const bug of state.bugs) seen.add(bug.id);
      spawnedPerWave.set(state.wave.number, seen);
    }
    const counts = [1, 2, 3, 4].map((n) => spawnedPerWave.get(n)?.size ?? 0);
    expect(counts[0]).toBeGreaterThan(0);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);

    expect(events.filter((e) => e.type === "waveCleared").map((e) => e.type === "waveCleared" && e.wave)).toEqual([1, 2, 3, 4]);
    expect(events.filter((e) => e.type === "waveStarted").length).toBeGreaterThanOrEqual(4);
    expect(state.wavesSurvived).toBe(4);
    expect(score(state)).toBe(state.kills + 4);
    expect(state.kills).toBe(counts.reduce((a, b) => a + b, 0));
  });
});

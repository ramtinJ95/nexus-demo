import { describe, expect, it } from "vitest";
import { enemyTypes } from "./enemies";
import { defaultSettings, type Settings } from "./settings";
import { createGame, pylonCenter, step } from "./step";
import type { Bug, EnemyKind, GameEvent, GameState, InputFrame, Vec } from "./types";

const settings = defaultSettings;
const tps = settings.ticksPerSecond;
const sturdy: Settings = { ...settings, pylon: { ...settings.pylon, maxIntegrity: 1e9 } };
const noWaves: Settings = { ...settings, waves: { ...settings.waves, firstWaveDelay: 1e9 } };

const still = (aim: Vec, fire = false): InputFrame => ({ move: { x: 0, y: 0 }, aim, fire });
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Flies to the outer side of the bug nearest the pylon and shoots it, so every shot lands from behind. */
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

function placeBug(state: GameState, kind: Exclude<EnemyKind, "dasher">, pos: Vec): Bug {
  const center = pylonCenter(settings);
  const d = dist(center, pos);
  const bug: Bug = { id: state.nextId++, kind, pos, hp: enemyTypes[kind].hp, latched: false, facing: { x: (center.x - pos.x) / d, y: (center.y - pos.y) / d } };
  state.bugs.push(bug);
  return bug;
}

type Spawn = { wave: number; kind: EnemyKind; tick: number; pos: Vec; events: GameEvent[] };

/** Circles the arena on a fixed script, shooting in bursts at the bug nearest the pylon. */
function roam(state: GameState): InputFrame {
  const angle = state.tick / 40;
  const center = pylonCenter(sturdy);
  const target = state.bugs.toSorted((a, b) => dist(a.pos, center) - dist(b.pos, center))[0];
  return { move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) * 0.6 }, aim: target ? target.pos : center, fire: state.tick % 90 < 60 };
}

function runSturdy(seed: number, waves: number, policy: (state: GameState) => InputFrame = (st) => flank(st, sturdy)): { spawns: Spawn[]; state: GameState; events: GameEvent[] } {
  const state = createGame(seed, sturdy);
  const seen = new Set<number>();
  const spawns: Spawn[] = [];
  const events: GameEvent[] = [];
  while (state.wavesSurvived < waves && state.tick < 900 * tps) {
    const tickEvents = step(state, policy(state), sturdy);
    events.push(...tickEvents);
    for (const bug of state.bugs) {
      if (seen.has(bug.id)) continue;
      seen.add(bug.id);
      spawns.push({ wave: state.wave.number, kind: bug.kind, tick: state.tick, pos: { ...bug.pos }, events: tickEvents });
    }
  }
  return { spawns, state, events };
}

describe("enemy variety", () => {
  it("waves introduce new kinds one at a time, each debuting as its wave's first bug", () => {
    const { spawns, state } = runSturdy(21, 5);
    expect(state.wavesSurvived).toBe(5);
    const kindsIn = (wave: number) => new Set(spawns.filter((s) => s.wave === wave && s.kind !== "splitling").map((s) => s.kind));
    const allowed: EnemyKind[][] = [["crawler"], ["crawler", "dasher"], ["crawler", "dasher", "splitter"], ["crawler", "dasher", "splitter", "shielded"]];
    for (let wave = 1; wave <= 5; wave++) {
      const kinds = allowed[Math.min(wave, 4) - 1]!;
      for (const kind of kindsIn(wave)) expect(kinds, `wave ${wave}`).toContain(kind);
    }
    expect(kindsIn(1)).toEqual(new Set(["crawler"]));

    const firstOf = (wave: number) => spawns.find((s) => s.wave === wave)?.kind;
    expect([1, 2, 3, 4].map(firstOf)).toEqual(["crawler", "dasher", "splitter", "shielded"]);

    const splitlings = spawns.filter((s) => s.kind === "splitling");
    expect(splitlings.length).toBeGreaterThan(0);
    for (const s of splitlings) {
      const parentDeath = s.events.find((e) => e.type === "bugKilled" && e.kind === "splitter" && dist(e.pos, s.pos) <= 2 * enemyTypes.splitter.radius);
      expect(parentDeath, `splitling at tick ${s.tick}`).toBeDefined();
    }
  });

  it("a dasher pauses, then lunges at the drone and knocks it back", () => {
    const state = createGame(1, noWaves);
    const dash = enemyTypes.dasher.dash!;
    const start = { x: 200, y: 360 };
    state.bugs.push({ id: state.nextId++, kind: "dasher", pos: { ...start }, hp: 2, latched: false, facing: { x: 1, y: 0 }, dash: { phase: "stalk", left: 0 } });
    state.drone.pos = { x: 330, y: 250 };
    const target = { ...state.drone.pos };
    const aim = { x: 0, y: 0 };

    const windupTicks = Math.floor(dash.windupSeconds * tps);
    for (let i = 0; i < windupTicks; i++) step(state, still(aim), noWaves);
    expect(state.bugs[0]!.pos).toEqual(start);

    const toDrone = { x: (target.x - start.x) / dist(target, start), y: (target.y - start.y) / dist(target, start) };
    const crawlPerTick = enemyTypes.dasher.speed / tps;
    let hit: GameEvent | undefined;
    let prev = { ...state.bugs[0]!.pos };
    let lungeTicks = 0;
    for (let i = 0; i < 2 * dash.lungeSeconds * tps && !hit; i++) {
      hit = step(state, still(aim), noWaves).find((e) => e.type === "droneHit");
      const pos = state.bugs[0]!.pos;
      const moved = dist(pos, prev);
      if (moved > 0) {
        lungeTicks++;
        expect(moved).toBeGreaterThan(5 * crawlPerTick);
        expect(((pos.x - prev.x) * toDrone.x + (pos.y - prev.y) * toDrone.y) / moved).toBeGreaterThan(0.99);
      }
      prev = { ...pos };
    }
    expect(lungeTicks).toBeGreaterThan(0);
    expect(hit).toMatchObject({ type: "droneHit" });

    const atHit = { ...state.drone.pos };
    for (let i = 0; i < tps / 2; i++) step(state, still(aim), noWaves);
    const pushed = { x: state.drone.pos.x - atHit.x, y: state.drone.pos.y - atHit.y };
    expect(pushed.x * toDrone.x + pushed.y * toDrone.y).toBeGreaterThan(30);
  });

  it("a splitter breaks into two splitlings that each count as a kill", () => {
    const state = createGame(1, noWaves);
    state.drone.pos = { x: 640, y: 290 };
    const splitter = placeBug(state, "splitter", { x: 640, y: 120 });
    const events: GameEvent[] = [];
    while (!events.some((e) => e.type === "bugKilled") && state.tick < 5 * tps) {
      events.push(...step(state, still(splitter.pos, true), noWaves));
    }
    const death = events.find((e) => e.type === "bugKilled");
    expect(death).toMatchObject({ type: "bugKilled", kind: "splitter" });
    expect(state.kills).toBe(1);
    expect(state.bugs.map((b) => b.kind)).toEqual(["splitling", "splitling"]);
    for (const b of state.bugs) expect(dist(b.pos, death!.type === "bugKilled" ? death!.pos : b.pos)).toBeLessThan(enemyTypes.splitter.radius);

    const later: GameEvent[] = [];
    while (state.bugs.length > 0 && state.tick < 10 * tps) later.push(...step(state, still(state.bugs[0]!.pos, true), noWaves));
    expect(later.filter((e) => e.type === "bugKilled").map((e) => e.type === "bugKilled" && e.kind)).toEqual(["splitling", "splitling"]);
    expect(state.kills).toBe(3);
  });

  it("a shielded bug blocks shots to its front and dies to shots from behind", () => {
    const state = createGame(1, noWaves);
    state.drone.pos = { x: 640, y: 290 };
    const bug = placeBug(state, "shielded", { x: 640, y: 120 });
    const events: GameEvent[] = [];
    events.push(...step(state, still(bug.pos, true), noWaves));
    while (state.bullets.length > 0) events.push(...step(state, still(bug.pos), noWaves));
    expect(events.filter((e) => e.type === "shieldBlocked")).toHaveLength(1);
    expect(events.some((e) => e.type === "bugKilled")).toBe(false);
    expect(state.bugs[0]!.hp).toBe(enemyTypes.shielded.hp);

    state.drone.pos = { x: 640, y: 20 };
    const behind: GameEvent[] = [];
    while (state.bugs.length > 0 && state.tick < 5 * tps) behind.push(...step(state, still(bug.pos, true), noWaves));
    expect(behind.some((e) => e.type === "shieldBlocked")).toBe(false);
    expect(behind.filter((e) => e.type === "bugKilled")).toEqual([{ type: "bugKilled", kind: "shielded", pos: expect.anything() }]);
  });

  it("replays identically with every kind on the field", () => {
    const a = runSturdy(77, 5, roam);
    const b = runSturdy(77, 5, roam);
    expect(a.state.wavesSurvived).toBe(5);
    expect(new Set(a.spawns.map((s) => s.kind))).toEqual(new Set(Object.keys(enemyTypes)));
    expect(a.events.some((e) => e.type === "droneHit")).toBe(true);
    expect(a.events.some((e) => e.type === "shieldBlocked")).toBe(true);
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
  });
});

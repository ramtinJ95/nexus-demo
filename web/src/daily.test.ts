import { describe, expect, test } from "vitest";
import { dailySeed, dayOf } from "./daily";
import { defaultSettings } from "./sim/settings";
import { createGame, step } from "./sim/step";
import type { GameState, InputFrame } from "./sim/types";

const settings = defaultSettings;

function scripted(tick: number): InputFrame {
  const angle = tick / 40;
  return {
    move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) * 0.6 },
    aim: { x: 640 + Math.cos(angle * 3) * 400, y: 360 + Math.sin(angle * 3) * 300 },
    fire: tick % 90 < 60,
  };
}

function play(seed: number, ticks: number): GameState {
  const state = createGame(seed, settings);
  for (let i = 0; i < ticks; i++) step(state, scripted(state.tick), settings);
  return state;
}

describe("daily seed", () => {
  test("is the same all through one UTC day", () => {
    const morning = dayOf(new Date("2026-10-30T00:00:00Z"));
    const night = dayOf(new Date("2026-10-30T23:59:59.999Z"));
    expect(morning).toBe("2026-10-30");
    expect(night).toBe("2026-10-30");
    expect(dailySeed(night)).toBe(dailySeed(morning));
  });

  test("follows the UTC date, not the local offset of the clock", () => {
    expect(dayOf(new Date("2026-10-30T23:30:00-05:00"))).toBe("2026-10-31");
    expect(dayOf(new Date("2026-10-31T00:30:00+02:00"))).toBe("2026-10-30");
  });

  test("changes at midnight UTC", () => {
    const before = dayOf(new Date("2026-10-30T23:59:00Z"));
    const after = dayOf(new Date("2026-10-31T00:00:00Z"));
    expect(after).toBe("2026-10-31");
    expect(dailySeed(after)).not.toBe(dailySeed(before));
  });

  test("differs across a year of dates", () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 365; i++) seeds.add(dailySeed(dayOf(new Date(Date.UTC(2026, 0, 1 + i)))));
    expect(seeds.size).toBe(365);
  });

  test("gives two players on the same day the same waves, and another day different ones", () => {
    const ticks = 60 * settings.ticksPerSecond;
    const day = dayOf(new Date("2026-10-30T09:00:00Z"));
    const first = play(dailySeed(day), ticks);
    const second = play(dailySeed(dayOf(new Date("2026-10-30T21:00:00Z"))), ticks);
    expect(first.wave.number).toBeGreaterThan(1);
    expect(first.bugs.length + first.kills).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(play(dailySeed(dayOf(new Date("2026-10-31T09:00:00Z"))), ticks)).not.toEqual(first);
  });
});

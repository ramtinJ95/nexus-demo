import { describe, expect, it } from "vitest";
import { DEAD_ZONE, STICK_RADIUS, drag, firing, noSticks, press, release, stickVector } from "./touch";

const WIDTH = 390;

describe("touch sticks", () => {
  it("gives the left half of the screen to the move stick and the right half to the aim stick", () => {
    const sticks = noSticks();
    expect(press(sticks, 1, { x: 80, y: 700 }, WIDTH)).toBe("move");
    expect(press(sticks, 2, { x: 300, y: 700 }, WIDTH)).toBe("aim");
    expect(sticks.move?.pointerId).toBe(1);
    expect(sticks.aim?.pointerId).toBe(2);
  });

  it("ignores a second touch on a side that already has a stick", () => {
    const sticks = noSticks();
    press(sticks, 1, { x: 80, y: 700 }, WIDTH);
    expect(press(sticks, 3, { x: 120, y: 600 }, WIDTH)).toBeUndefined();
    drag(sticks, 3, { x: 0, y: 600 });
    expect(stickVector(sticks.move!)).toEqual({ x: 0, y: 0 });
  });

  it("reads a small wobble inside the dead zone as centered", () => {
    const sticks = noSticks();
    press(sticks, 1, { x: 80, y: 700 }, WIDTH);
    drag(sticks, 1, { x: 80 + STICK_RADIUS * DEAD_ZONE * 0.9, y: 700 });
    expect(stickVector(sticks.move!)).toEqual({ x: 0, y: 0 });
  });

  it("moves at full speed when the knob is pushed past the rim, and slower when it is pushed less", () => {
    const sticks = noSticks();
    press(sticks, 1, { x: 80, y: 700 }, WIDTH);
    drag(sticks, 1, { x: 80, y: 700 - STICK_RADIUS * 3 });
    const full = stickVector(sticks.move!);
    expect(full.x).toBeCloseTo(0);
    expect(full.y).toBeCloseTo(-1);
    drag(sticks, 1, { x: 80 + STICK_RADIUS * 0.5, y: 700 });
    const half = stickVector(sticks.move!);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(1);
  });

  it("fires while the aim stick is held and stops when it is let go", () => {
    const sticks = noSticks();
    press(sticks, 2, { x: 300, y: 700 }, WIDTH);
    expect(firing(sticks)).toBe(false);
    drag(sticks, 2, { x: 300, y: 640 });
    expect(firing(sticks)).toBe(true);
    expect(sticks.aimDir).toEqual({ x: 0, y: -1 });
    drag(sticks, 2, { x: 301, y: 700 });
    expect(firing(sticks)).toBe(true);
    expect(sticks.aimDir).toEqual({ x: 0, y: -1 });
    release(sticks, 2);
    expect(firing(sticks)).toBe(false);
  });

  it("frees a side when its touch lifts, so the next touch there takes it", () => {
    const sticks = noSticks();
    press(sticks, 1, { x: 80, y: 700 }, WIDTH);
    release(sticks, 1);
    expect(sticks.move).toBeNull();
    expect(press(sticks, 4, { x: 60, y: 500 }, WIDTH)).toBe("move");
  });
});

import type { Vec } from "./sim/types";

export type StickSide = "move" | "aim";

/** One held virtual stick. Points are CSS pixels relative to the game root. The stick is centered where the touch began. */
export type Stick = { pointerId: number; origin: Vec; knob: Vec };

/** `aimDir` is the last aim direction past the dead zone, kept so a held aim stick fires that way after the thumb recenters. */
export type Sticks = { move: Stick | null; aim: Stick | null; aimDir: Vec | null };

/** How far the knob travels from the stick's center, in CSS pixels. */
export const STICK_RADIUS = 56;
/** Deflection below this fraction of the radius reads as centered. */
export const DEAD_ZONE = 0.18;

export const noSticks = (): Sticks => ({ move: null, aim: null, aimDir: null });

/** The left half of the screen is the move stick and the right half is the aim stick, in either orientation. */
export const sideFor = (x: number, width: number): StickSide => (x < width / 2 ? "move" : "aim");

/** The knob's offset from the stick's center, clamped to the radius. */
export function knobOffset(stick: Stick, radius = STICK_RADIUS): Vec {
  const dx = stick.knob.x - stick.origin.x;
  const dy = stick.knob.y - stick.origin.y;
  const len = Math.hypot(dx, dy);
  return len > radius ? { x: (dx / len) * radius, y: (dy / len) * radius } : { x: dx, y: dy };
}

/** Deflection as a vector of length 0 to 1. Inside the dead zone it is zero. */
export function stickVector(stick: Stick, radius = STICK_RADIUS): Vec {
  const offset = knobOffset(stick, radius);
  const len = Math.hypot(offset.x, offset.y) / radius;
  if (len < DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = (len - DEAD_ZONE) / (1 - DEAD_ZONE) / len;
  return { x: (offset.x / radius) * scaled, y: (offset.y / radius) * scaled };
}

/** Starts a stick on the touch's side unless that side already has one. Returns the side it took. */
export function press(sticks: Sticks, pointerId: number, point: Vec, width: number): StickSide | undefined {
  const side = sideFor(point.x, width);
  if (sticks[side]) return undefined;
  sticks[side] = { pointerId, origin: point, knob: point };
  return side;
}

export function drag(sticks: Sticks, pointerId: number, point: Vec): void {
  for (const side of ["move", "aim"] as const) {
    const stick = sticks[side];
    if (stick?.pointerId !== pointerId) continue;
    stick.knob = point;
    if (side === "aim") {
      const v = stickVector(stick);
      const len = Math.hypot(v.x, v.y);
      if (len > 0) sticks.aimDir = { x: v.x / len, y: v.y / len };
    }
  }
}

export function release(sticks: Sticks, pointerId: number): void {
  if (sticks.move?.pointerId === pointerId) sticks.move = null;
  if (sticks.aim?.pointerId === pointerId) sticks.aim = null;
}

/** The fire button is the aim stick itself: the drone fires while it is held, once it has a direction. */
export const firing = (sticks: Sticks): boolean => sticks.aim !== null && sticks.aimDir !== null;

import { describe, expect, it } from "vitest";
import { defaultSettings, type Settings } from "../sim/settings";
import type { GameEvent } from "../sim/types";
import { advanceEffects, applyEvent, createEffects, frameEffects, shakeOffset, type Effects } from "./effects";

const settings = defaultSettings;
const reduced: Settings = { ...settings, fx: { ...settings.fx, reducedMotion: true } };
const frame = 1 / 60;

function advance(fx: Effects, seconds: number, s: Settings = settings): void {
  for (let t = 0; t < seconds; t += frame) advanceEffects(fx, frame, s);
}

const hit: GameEvent = { type: "bugHit", id: 7, kind: "crawler", pos: { x: 300, y: 200 } };
const kill: GameEvent = { type: "bugKilled", kind: "crawler", pos: { x: 300, y: 200 } };
const shot: GameEvent = { type: "shotFired", pos: { x: 640, y: 450 }, dir: { x: 0, y: -1 } };
const pylonHit: GameEvent = { type: "pylonHit", integrity: 90 };

describe("effects", () => {
  it("a kill bursts particles near the bug that fade out after their life", () => {
    const fx = createEffects(1);
    applyEvent(fx, kill, settings);
    expect(fx.particles).toHaveLength(settings.fx.particles.perDeath);
    advance(fx, 0.1);
    for (const p of fx.particles) expect(Math.hypot(p.pos.x - 300, p.pos.y - 200)).toBeLessThan(80);
    advance(fx, settings.fx.particles.lifeSeconds);
    expect(fx.particles).toHaveLength(0);
  });

  it("caps the particle count", () => {
    const fx = createEffects(1);
    for (let i = 0; i < 100; i++) applyEvent(fx, kill, settings);
    expect(fx.particles).toHaveLength(settings.fx.particles.max);
  });

  it("a pylon hit shakes the camera, then settles", () => {
    const fx = createEffects(1);
    expect(shakeOffset(fx, settings)).toEqual({ x: 0, y: 0 });
    applyEvent(fx, pylonHit, settings);
    const { x, y } = shakeOffset(fx, settings);
    expect(Math.hypot(x, y)).toBeGreaterThan(1);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(settings.fx.shake.maxOffset * Math.SQRT2);
    expect(fx.pylonPulse).toBeGreaterThan(0);
    advance(fx, 1);
    expect(shakeOffset(fx, settings)).toEqual({ x: 0, y: 0 });
    expect(fx.pylonPulse).toBe(0);
  });

  it("a hit flashes that bug until the flash expires", () => {
    const fx = createEffects(1);
    applyEvent(fx, hit, settings);
    expect(fx.hitFlashes.has(7)).toBe(true);
    expect(fx.hitFlashes.has(8)).toBe(false);
    expect(fx.particles).toHaveLength(settings.fx.particles.perHit);
    advance(fx, settings.fx.hitFlashSeconds + frame);
    expect(fx.hitFlashes.has(7)).toBe(false);
  });

  it("a shot flashes the muzzle briefly", () => {
    const fx = createEffects(1);
    applyEvent(fx, shot, settings);
    expect(fx.muzzleFlash).toBeGreaterThan(0);
    advance(fx, settings.fx.muzzleFlashSeconds + frame);
    expect(fx.muzzleFlash).toBe(0);
  });

  it("a flash from this frame's events survives a frame longer than its lifetime", () => {
    const fx = createEffects(1);
    frameEffects(fx, [shot, hit], 0.2, settings);
    expect(fx.muzzleFlash).toBe(settings.fx.muzzleFlashSeconds);
    expect(fx.hitFlashes.get(7)).toBe(settings.fx.hitFlashSeconds);
    frameEffects(fx, [], 0.2, settings);
    expect(fx.muzzleFlash).toBe(0);
    expect(fx.hitFlashes.has(7)).toBe(false);
  });

  it("reduced motion drops shake and flashes but keeps particles and the pylon pulse", () => {
    const fx = createEffects(1);
    for (const event of [hit, kill, shot, pylonHit]) applyEvent(fx, event, reduced);
    expect(shakeOffset(fx, reduced)).toEqual({ x: 0, y: 0 });
    expect(fx.hitFlashes.size).toBe(0);
    expect(fx.muzzleFlash).toBe(0);
    expect(fx.pylonPulse).toBeGreaterThan(0);
    expect(fx.particles).toHaveLength(settings.fx.particles.perHit + settings.fx.particles.perDeath);
  });

  it("replays identically from the same seed and events", () => {
    const play = (seed: number) => {
      const fx = createEffects(seed);
      for (let i = 0; i < 40; i++) {
        applyEvent(fx, [hit, kill, shot, pylonHit][i % 4]!, settings);
        advance(fx, 0.05);
      }
      return fx;
    };
    expect(play(42)).toEqual(play(42));
    expect(play(43).particles).not.toEqual(play(42).particles);
  });
});

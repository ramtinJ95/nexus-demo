import { nextRandom } from "../sim/rng";
import type { Settings } from "../sim/settings";
import type { EnemyKind, GameEvent, Vec } from "../sim/types";

/** A tint, not a color, so the palette resolves it at draw time and a palette switch recolors live sparks. */
/** Tints whose color is the same in every palette. */
export const fixedTints = { white: "#ffffff", shield: "#bfe6ff" } as const;

export type Tint = EnemyKind | keyof typeof fixedTints;

export type Particle = { pos: Vec; vel: Vec; age: number; life: number; tint: Tint; size: number };

/**
 * Cosmetic state derived from sim events. It follows the sim's determinism rule but has its own RNG stream,
 * so effects never change a seed's gameplay.
 */
export type Effects = {
  rng: number;
  /** Seconds of effects time, the phase of the shake wobble. */
  clock: number;
  particles: Particle[];
  /** Shake amount, 0 to 1. */
  trauma: number;
  /** Bug id to seconds of flash left. */
  hitFlashes: Map<number, number>;
  muzzleFlash: number;
  pylonPulse: number;
};

export function createEffects(seed: number): Effects {
  return {
    rng: (seed ^ 0x9e3779b9) >>> 0,
    clock: 0,
    particles: [],
    trauma: 0,
    hitFlashes: new Map(),
    muzzleFlash: 0,
    pylonPulse: 0,
  };
}

export function applyEvent(fx: Effects, event: GameEvent, settings: Settings): void {
  const motion = !settings.fx.reducedMotion;
  switch (event.type) {
    case "bugHit":
      burst(fx, event.pos, event.kind, settings.fx.particles.perHit, 1, settings);
      if (motion) fx.hitFlashes.set(event.id, settings.fx.hitFlashSeconds);
      break;
    case "bugKilled":
      burst(fx, event.pos, event.kind, settings.fx.particles.perDeath, 1.4, settings);
      break;
    case "shieldBlocked":
      burst(fx, event.pos, "shield", settings.fx.particles.perHit, 0.8, settings);
      break;
    case "shotFired":
      if (motion) fx.muzzleFlash = settings.fx.muzzleFlashSeconds;
      break;
    case "pylonHit":
      fx.pylonPulse = settings.fx.pylonPulseSeconds;
      if (motion) fx.trauma = Math.min(1, fx.trauma + settings.fx.shake.kick);
      break;
  }
}

function burst(fx: Effects, at: Vec, tint: Exclude<Tint, "white">, count: number, power: number, settings: Settings): void {
  const { speed, lifeSeconds, max } = settings.fx.particles;
  for (let i = 0; i < count; i++) {
    const angle = nextRandom(fx) * Math.PI * 2;
    const v = speed * power * (0.35 + 0.65 * nextRandom(fx));
    fx.particles.push({
      pos: { ...at },
      vel: { x: Math.cos(angle) * v, y: Math.sin(angle) * v },
      age: 0,
      life: lifeSeconds * (0.6 + 0.4 * nextRandom(fx)),
      tint: i % 4 === 0 ? "white" : tint,
      size: 1.5 + 1.5 * nextRandom(fx),
    });
  }
  if (fx.particles.length > max) fx.particles.splice(0, fx.particles.length - max);
}

export function advanceEffects(fx: Effects, dt: number, settings: Settings): void {
  const keep = (1 - settings.fx.particles.drag) ** dt;
  fx.clock += dt;
  for (const p of fx.particles) {
    p.age += dt;
    p.vel.x *= keep;
    p.vel.y *= keep;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
  }
  fx.particles = fx.particles.filter((p) => p.age < p.life);
  fx.trauma = Math.max(0, fx.trauma - settings.fx.shake.decayPerSecond * dt);
  fx.muzzleFlash = Math.max(0, fx.muzzleFlash - dt);
  fx.pylonPulse = Math.max(0, fx.pylonPulse - dt);
  for (const [id, left] of fx.hitFlashes) {
    if (left - dt <= 0) fx.hitFlashes.delete(id);
    else fx.hitFlashes.set(id, left - dt);
  }
}

/** One rendered frame: age what was already on screen, then add this frame's events so they render at full strength. */
export function frameEffects(fx: Effects, events: readonly GameEvent[], dt: number, settings: Settings): void {
  advanceEffects(fx, dt, settings);
  for (const event of events) applyEvent(fx, event, settings);
}

/** Arena-unit camera offset. Two incommensurate sines wobble smoothly where random jitter would strobe. */
export function shakeOffset(fx: Effects, settings: Settings): Vec {
  if (fx.trauma <= 0) return { x: 0, y: 0 };
  const amount = settings.fx.shake.maxOffset * fx.trauma ** 2;
  return { x: amount * Math.sin(fx.clock * 53 + 1.1), y: amount * Math.cos(fx.clock * 47 + 0.4) };
}

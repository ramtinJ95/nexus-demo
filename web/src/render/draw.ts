import { fixedTints, shakeOffset, type Effects } from "../fx/effects";
import { enemyTypes, type EnemyType } from "../sim/enemies";
import type { Settings } from "../sim/settings";
import { pylonCenter } from "../sim/step";
import type { Bug, EnemyKind, GameState } from "../sim/types";
import { withAlpha, type Palette } from "./palette";
import { fitViewport, type Viewport } from "./viewport";

const GRID = 40;

export type Renderer = { draw(state: GameState, now: number, fx: Effects, palette: Palette): void; viewport(): Viewport };

export function createRenderer(canvas: HTMLCanvasElement, settings: Settings): Renderer {
  const ctx = canvas.getContext("2d")!;
  let view = fitViewport(1, 1, settings.arena);
  let dpr = 1;

  function resize(): void {
    const { clientWidth: w, clientHeight: h } = canvas;
    dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    view = fitViewport(w, h, settings.arena);
  }

  return {
    viewport: () => view,
    draw(state, now, fx, palette) {
      resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.offsetX * dpr, view.offsetY * dpr);
      const shake = shakeOffset(fx, settings);
      ctx.translate(shake.x, shake.y);
      drawArena(ctx, settings, palette);
      drawPylon(ctx, state, settings, palette, now, fx.pylonPulse / settings.fx.pylonPulseSeconds);
      for (const bug of state.bugs) drawBug(ctx, bug, state, palette, fx.hitFlashes.has(bug.id));
      drawParticles(ctx, fx, palette);
      drawBullets(ctx, state, palette);
      drawDrone(ctx, state, settings, palette, fx.muzzleFlash / settings.fx.muzzleFlashSeconds);
    },
  };
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function drawArena(ctx: CanvasRenderingContext2D, settings: Settings, palette: Palette): void {
  const { width, height } = settings.arena;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#04050c";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = withAlpha(palette.drone, 0.07);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = GRID; x < width; x += GRID) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = GRID; y < height; y += GRID) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  glow(ctx, palette.drone, 14);
  ctx.strokeStyle = withAlpha(palette.drone, 0.6);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}

/** `hit` runs from 1 at a pylon hit down to 0. */
function drawPylon(ctx: CanvasRenderingContext2D, state: GameState, settings: Settings, palette: Palette, now: number, hit: number): void {
  const c = pylonCenter(settings);
  const r = settings.pylon.radius;
  const health = state.integrity / settings.pylon.maxIntegrity;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  const ringColor = health > 0.5 ? palette.health.ok : health > 0.25 ? palette.health.warn : palette.health.low;

  ctx.save();
  ctx.translate(c.x, c.y);
  glow(ctx, palette.pylon, 30 + pulse * 20 + hit * 60);
  ctx.fillStyle = withAlpha(palette.pylon, 0.18 + hit * 0.3);
  ctx.strokeStyle = palette.pylon;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + now / 2400;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.pylonCore;
  ctx.beginPath();
  ctx.arc(0, 0, r * (0.28 + pulse * 0.06), 0, Math.PI * 2);
  ctx.fill();

  const ringR = r + 14;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();
  glow(ctx, ringColor, 16);
  ctx.strokeStyle = ringColor;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, health));
  ctx.stroke();

  if (hit > 0) {
    glow(ctx, palette.pylon, 24);
    ctx.strokeStyle = withAlpha(palette.pylon, hit);
    ctx.lineWidth = 2 + hit * 3;
    ctx.beginPath();
    ctx.arc(0, 0, ringR + (1 - hit) * 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

const DARK = "#04050c";

type BodyDrawer = (ctx: CanvasRenderingContext2D, bug: Bug, r: number, fill: string, tick: number) => void;

/** Leg length as a fraction of the crawler's, so a slim or fat body isn't drowned out by its legs. */
const legReach: Partial<Record<EnemyKind, number>> = { dasher: 0.7, splitter: 0.8 };

const bodies: Record<EnemyKind, BodyDrawer> = {
  crawler(ctx, _bug, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.75, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, r * 0.45, r * 0.18, 1.8);
  },
  dasher(ctx, bug, r, fill, tick) {
    const windup = bug.kind === "dasher" && bug.dash.phase === "windup";
    ctx.fillStyle = windup && tick % 6 < 3 ? "#ffffff" : fill;
    ctx.save();
    if (windup) ctx.scale(0.7, 1.15);
    ctx.beginPath();
    ctx.moveTo(r * 1.7, 0);
    ctx.lineTo(-r * 0.2, r * 0.55);
    ctx.lineTo(-r * 1.1, 0);
    ctx.lineTo(-r * 0.2, -r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    eyes(ctx, r * 0.5, r * 0.13, 1.5);
  },
  splitter(ctx, _bug, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.36, r * 0.8, r * 0.48, 0, 0, Math.PI * 2);
    ctx.ellipse(0, r * 0.36, r * 0.8, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, 0);
    ctx.lineTo(r * 0.9, 0);
    ctx.stroke();
    eyes(ctx, r * 0.55, r * 0.36, 2);
  },
  splitling(ctx, _bug, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, r * 0.45, r * 0.2, 1.3);
  },
  shielded(ctx, _bug, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r * 0.65, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, r * 0.3, r * 0.18, 1.8);
    glow(ctx, "#bfe6ff", 22);
    ctx.strokeStyle = "#dff3ff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  },
};

function eyes(ctx: CanvasRenderingContext2D, x: number, spread: number, size: number): void {
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.arc(x, -spread, size, 0, Math.PI * 2);
  ctx.arc(x, spread, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(ctx: CanvasRenderingContext2D, bug: Bug, type: EnemyType, tick: number, color: string): void {
  const r = type.radius * (legReach[bug.kind] ?? 1);
  const scurry = bug.latched ? 0.6 : 0.35;
  const sweep = bug.kind === "dasher" ? -r * 0.7 : 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const pairs = type.legs / 2;
  for (let i = 0; i < pairs; i++) {
    const along = ((i - (pairs - 1) / 2) / pairs) * r * 1.4;
    for (const side of [-1, 1]) {
      const wiggle = Math.sin(tick * scurry + bug.id * 1.7 + i * 2.1 + side) * type.jitter;
      const knee = { x: along + Math.cos(side * (Math.PI / 2) + wiggle) * r * 0.9 + sweep * 0.5, y: side * r * 0.9 };
      ctx.moveTo(along * 0.6, 0);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(knee.x + wiggle * r * 0.6 + sweep, knee.y + side * r * 0.55);
    }
  }
  ctx.stroke();
}

function drawBug(ctx: CanvasRenderingContext2D, bug: Bug, state: GameState, palette: Palette, flash: boolean): void {
  const type = enemyTypes[bug.kind];
  const r = type.radius;
  const tick = state.tick;

  ctx.save();
  ctx.translate(bug.pos.x, bug.pos.y);
  if (bug.kind === "dasher" && bug.dash.phase === "windup") {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha(palette.enemies.dasher, 0.45);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(state.drone.pos.x - bug.pos.x, state.drone.pos.y - bug.pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.rotate(Math.atan2(bug.facing.y, bug.facing.x));
  if (bug.kind === "dasher" && bug.dash.phase === "lunge") {
    ctx.shadowBlur = 0;
    for (let i = 1; i <= 3; i++) {
      ctx.fillStyle = withAlpha(palette.enemies.dasher, 0.35 / i);
      ctx.beginPath();
      ctx.ellipse(-r * 1.1 * i, 0, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const color = flash ? "#ffffff" : palette.enemies[bug.kind];
  glow(ctx, color, flash ? 28 : bug.latched ? 22 : 12);
  drawLegs(ctx, bug, type, tick, color);
  bodies[bug.kind](ctx, bug, r, bug.latched && tick % 20 < 10 ? "#ffffff" : color, tick);
  ctx.restore();
}

/** Additive blending lets overlapping sparks bloom; a faint halo stands in for shadowBlur, which is slow per particle. */
function drawParticles(ctx: CanvasRenderingContext2D, fx: Effects, palette: Palette): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 0;
  for (const p of fx.particles) {
    const fade = 1 - p.age / p.life;
    ctx.fillStyle = p.tint in fixedTints ? fixedTints[p.tint as keyof typeof fixedTints] : palette.enemies[p.tint as EnemyKind];
    ctx.globalAlpha = fade * 0.25;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState, palette: Palette): void {
  glow(ctx, palette.bulletGlow, 12);
  ctx.strokeStyle = palette.bullet;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const b of state.bullets) {
    ctx.moveTo(b.pos.x, b.pos.y);
    ctx.lineTo(b.pos.x - b.vel.x * 0.012, b.pos.y - b.vel.y * 0.012);
  }
  ctx.stroke();
}

/** `muzzle` runs from 1 at a shot down to 0. */
function drawDrone(ctx: CanvasRenderingContext2D, state: GameState, settings: Settings, palette: Palette, muzzle: number): void {
  const { pos, aim } = state.drone;
  const r = settings.drone.radius;
  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(palette.drone, 0.25);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.moveTo(aim.x * (r + 10), aim.y * (r + 10));
  ctx.lineTo(aim.x * 160, aim.y * 160);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.rotate(Math.atan2(aim.y, aim.x));
  glow(ctx, palette.drone, 18);
  ctx.strokeStyle = palette.drone;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r * 0.3, 0);
  ctx.lineTo(r + 6, 0);
  ctx.stroke();

  ctx.fillStyle = withAlpha(palette.drone, 0.2);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.7, r * 0.8);
  ctx.lineTo(-r * 0.35, 0);
  ctx.lineTo(-r * 0.7, -r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (muzzle > 0) {
    const tip = r + 6;
    glow(ctx, palette.bulletGlow, 24);
    ctx.globalAlpha = muzzle;
    ctx.fillStyle = palette.muzzle;
    ctx.beginPath();
    ctx.moveTo(tip, -5);
    ctx.lineTo(tip + 20, 0);
    ctx.lineTo(tip, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

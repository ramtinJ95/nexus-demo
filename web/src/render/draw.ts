import { shakeOffset, type Effects } from "../fx/effects";
import { enemyTypes } from "../sim/enemies";
import type { Settings } from "../sim/settings";
import { pylonCenter } from "../sim/step";
import type { Bug, GameState, Vec } from "../sim/types";
import { fitViewport, type Viewport } from "./viewport";

const CYAN = "#29f3ff";
const MAGENTA = "#ff2bd6";
const GRID = 40;

export type Renderer = { draw(state: GameState, now: number, fx: Effects): void; viewport(): Viewport };

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
    draw(state, now, fx) {
      resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.offsetX * dpr, view.offsetY * dpr);
      const shake = shakeOffset(fx, settings);
      ctx.translate(shake.x, shake.y);
      drawArena(ctx, settings);
      drawPylon(ctx, state, settings, now, fx.pylonPulse / settings.fx.pylonPulseSeconds);
      for (const bug of state.bugs) drawBug(ctx, bug, state.tick, pylonCenter(settings), fx.hitFlashes.has(bug.id));
      drawParticles(ctx, fx);
      drawBullets(ctx, state);
      drawDrone(ctx, state, settings, fx.muzzleFlash / settings.fx.muzzleFlashSeconds);
    },
  };
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function drawArena(ctx: CanvasRenderingContext2D, settings: Settings): void {
  const { width, height } = settings.arena;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#04050c";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(41, 243, 255, 0.07)";
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
  glow(ctx, CYAN, 14);
  ctx.strokeStyle = "rgba(41, 243, 255, 0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}

/** `hit` runs from 1 at a pylon hit down to 0. */
function drawPylon(ctx: CanvasRenderingContext2D, state: GameState, settings: Settings, now: number, hit: number): void {
  const c = pylonCenter(settings);
  const r = settings.pylon.radius;
  const health = state.integrity / settings.pylon.maxIntegrity;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  const ringColor = health > 0.5 ? CYAN : health > 0.25 ? "#ffd23f" : "#ff3b5c";

  ctx.save();
  ctx.translate(c.x, c.y);
  glow(ctx, MAGENTA, 30 + pulse * 20 + hit * 60);
  ctx.fillStyle = `rgba(255, 43, 214, ${0.18 + hit * 0.3})`;
  ctx.strokeStyle = MAGENTA;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + now / 2400;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffd6f6";
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
    glow(ctx, MAGENTA, 24);
    ctx.strokeStyle = `rgba(255, 43, 214, ${hit})`;
    ctx.lineWidth = 2 + hit * 3;
    ctx.beginPath();
    ctx.arc(0, 0, ringR + (1 - hit) * 90, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBug(ctx: CanvasRenderingContext2D, bug: Bug, tick: number, target: Vec, flash: boolean): void {
  const type = enemyTypes[bug.kind];
  const r = type.radius;
  const heading = Math.atan2(target.y - bug.pos.y, target.x - bug.pos.x);
  const scurry = bug.latched ? 0.6 : 0.35;

  ctx.save();
  ctx.translate(bug.pos.x, bug.pos.y);
  ctx.rotate(heading);
  const color = flash ? "#ffffff" : type.color;
  glow(ctx, color, flash ? 28 : bug.latched ? 22 : 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const pairs = type.legs / 2;
  for (let i = 0; i < pairs; i++) {
    const along = ((i - (pairs - 1) / 2) / pairs) * r * 1.4;
    for (const side of [-1, 1]) {
      const wiggle = Math.sin(tick * scurry + bug.id * 1.7 + i * 2.1 + side) * type.jitter;
      const knee = { x: along + Math.cos(side * (Math.PI / 2) + wiggle) * r * 0.9, y: side * r * 0.9 };
      ctx.moveTo(along * 0.6, 0);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(knee.x + wiggle * r * 0.6, knee.y + side * r * 0.55);
    }
  }
  ctx.stroke();
  ctx.fillStyle = bug.latched && tick % 20 < 10 ? "#ffffff" : color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.75, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#04050c";
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.18, 1.8, 0, Math.PI * 2);
  ctx.arc(r * 0.45, r * 0.18, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Additive blending lets overlapping sparks bloom; a faint halo stands in for shadowBlur, which is slow per particle. */
function drawParticles(ctx: CanvasRenderingContext2D, fx: Effects): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 0;
  for (const p of fx.particles) {
    const fade = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
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

function drawBullets(ctx: CanvasRenderingContext2D, state: GameState): void {
  glow(ctx, "#fff27a", 12);
  ctx.strokeStyle = "#fff9c4";
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
function drawDrone(ctx: CanvasRenderingContext2D, state: GameState, settings: Settings, muzzle: number): void {
  const { pos, aim } = state.drone;
  const r = settings.drone.radius;
  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(41, 243, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.moveTo(aim.x * (r + 10), aim.y * (r + 10));
  ctx.lineTo(aim.x * 160, aim.y * 160);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.rotate(Math.atan2(aim.y, aim.x));
  glow(ctx, CYAN, 18);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r * 0.3, 0);
  ctx.lineTo(r + 6, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(41, 243, 255, 0.2)";
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
    glow(ctx, "#fff27a", 24);
    ctx.globalAlpha = muzzle;
    ctx.fillStyle = "#fffbe0";
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

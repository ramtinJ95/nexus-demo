import { enemyTypes } from "../sim/enemies";
import { withAlpha, type Palette } from "./palette";

/** Draws the title logo at the canvas's CSS size. Call again when the palette or the size changes. */
export function drawLogo(canvas: HTMLCanvasElement, palette: Palette): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const glow = (color: string, blur: number) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  };

  const hex = { x: w / 2, y: h * 0.34, r: h * 0.2 };
  ctx.save();
  ctx.translate(hex.x, hex.y);
  glow(palette.pylon, 30);
  ctx.fillStyle = withAlpha(palette.pylon, 0.22);
  ctx.strokeStyle = palette.pylon;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((Math.PI / 3) * i + Math.PI / 6) * hex.r, Math.sin((Math.PI / 3) * i + Math.PI / 6) * hex.r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.pylonCore;
  ctx.beginPath();
  ctx.arc(0, 0, hex.r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  glow(palette.health.ok, 14);
  ctx.strokeStyle = palette.health.ok;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, hex.r + 10, -Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.restore();

  const s = h * 0.06;
  ctx.save();
  ctx.translate(hex.x - hex.r * 2.6, hex.y + hex.r * 0.4);
  ctx.rotate(-0.25);
  glow(palette.drone, 16);
  ctx.strokeStyle = palette.drone;
  ctx.fillStyle = withAlpha(palette.drone, 0.2);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 1.2, 0);
  ctx.lineTo(-s, s);
  ctx.lineTo(-s * 0.5, 0);
  ctx.lineTo(-s, -s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  glow(palette.bulletGlow, 10);
  ctx.strokeStyle = palette.bullet;
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const d of [2.6, 4.4]) {
    ctx.moveTo(s * d, 0);
    ctx.lineTo(s * (d + 0.9), 0);
  }
  ctx.stroke();
  ctx.restore();

  const bugColor = palette.enemies.crawler;
  for (const [dx, dy, angle] of [[2.5, -0.5, Math.PI + 0.3], [3.1, 0.6, Math.PI - 0.2]] as const) {
    ctx.save();
    ctx.translate(hex.x + hex.r * dx, hex.y + hex.r * dy);
    ctx.rotate(angle);
    const r = (enemyTypes.crawler.radius / 13) * s;
    glow(bugColor, 12);
    ctx.strokeStyle = bugColor;
    ctx.fillStyle = bugColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const along of [-0.6, 0, 0.6]) {
      for (const side of [-1, 1]) {
        ctx.moveTo(along * r, 0);
        ctx.lineTo(along * r + r * 0.3, side * r * 0.9);
        ctx.lineTo(along * r + r * 0.1, side * r * 1.4);
      }
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const size = Math.min(h * 0.2, w / 9);
  ctx.font = `700 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${size * 0.12}px`;
  const textY = h * 0.8;
  glow(palette.pylon, 28);
  ctx.fillStyle = palette.pylon;
  ctx.fillText("PYLON PANIC", w / 2, textY);
  glow(palette.drone, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("PYLON PANIC", w / 2, textY);
}

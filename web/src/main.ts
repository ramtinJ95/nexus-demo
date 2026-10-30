import "./style.css";
import { startGame } from "./game";
import { advanceEffects, applyEvent, createEffects } from "./fx/effects";
import { createHud } from "./hud";
import { createInput } from "./input";
import { createRenderer } from "./render/draw";
import { seedFromString } from "./sim/rng";
import { defaultSettings } from "./sim/settings";

function resolveSeed(): number {
  const url = new URL(window.location.href);
  const text = url.searchParams.get("seed");
  if (text !== null && text.trim() !== "") return seedFromString(text);
  const seed = Math.floor(Math.random() * 0x100000000);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  return seed;
}

function resolveReducedMotion(): boolean {
  const param = new URL(window.location.href).searchParams.get("reducedMotion");
  return param === "1" || param === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Long frames are clamped so a resumed tab doesn't skip every effect to its end in one step. */
const MAX_FX_SECONDS = 0.1;

const root = document.querySelector<HTMLElement>('[data-testid="game"]')!;
const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
const seed = resolveSeed();
const reducedMotion = resolveReducedMotion();
const settings = { ...defaultSettings, fx: { ...defaultSettings.fx, reducedMotion } };
const renderer = createRenderer(canvas, settings);
const input = createInput(canvas, renderer.viewport);
const hud = createHud(root, settings);

let fx = createEffects(seed);
let lastFrame: number | undefined;
root.dataset.reducedMotion = String(reducedMotion);
root.dataset.shake = "false";

const game = startGame({
  seed,
  settings,
  readInput: input.read,
  onFrame(state, now) {
    advanceEffects(fx, Math.min(Math.max(0, (now - (lastFrame ?? now)) / 1000), MAX_FX_SECONDS), settings);
    lastFrame = now;
    renderer.draw(state, now, fx);
    hud.update(state);
    const shaking = String(fx.trauma > 0);
    if (root.dataset.shake !== shaking) root.dataset.shake = shaking;
  },
});

for (const type of ["bugHit", "bugKilled", "shotFired", "pylonHit"] as const) {
  game.on(type, (event) => applyEvent(fx, event, settings));
}

function restart(): void {
  game.restart();
  fx = createEffects(seed);
}

root.querySelector('[data-testid="restart"]')!.addEventListener("click", restart);
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && !e.repeat) restart();
});

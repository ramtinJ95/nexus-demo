import "./style.css";
import { startGame } from "./game";
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

const root = document.querySelector<HTMLElement>('[data-testid="game"]')!;
const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
const settings = defaultSettings;
const renderer = createRenderer(canvas, settings);
const input = createInput(canvas, renderer.viewport);
const hud = createHud(root, settings);

const game = startGame({
  seed: resolveSeed(),
  settings,
  readInput: input.read,
  onFrame(state, now) {
    renderer.draw(state, now);
    hud.update(state);
  },
});

root.querySelector('[data-testid="restart"]')!.addEventListener("click", () => game.restart());
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && !e.repeat) game.restart();
});

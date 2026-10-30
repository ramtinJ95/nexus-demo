import "./style.css";
import { createSfx } from "./audio";
import { startGame } from "./game";
import { createEffects, frameEffects } from "./fx/effects";
import { createHud } from "./hud";
import { createInput } from "./input";
import { newRunId } from "./leaderboard";
import { createLeaderboardPanel } from "./leaderboard-panel";
import { createMenus } from "./menus";
import { loadPrefs, savePrefs, type Prefs } from "./prefs";
import { createRenderer } from "./render/draw";
import { drawLogo } from "./render/logo";
import { palettes } from "./render/palette";
import { initialScreen, nextScreen, type Screen, type ScreenAction } from "./screen";
import { seedFromString } from "./sim/rng";
import { defaultSettings } from "./sim/settings";
import type { GameEvent } from "./sim/types";

function resolveSeed(): number {
  const url = new URL(window.location.href);
  const text = url.searchParams.get("seed");
  if (text !== null && text.trim() !== "") return seedFromString(text);
  const seed = Math.floor(Math.random() * 0x100000000);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  return seed;
}

function urlForcesReducedMotion(): boolean {
  const param = new URL(window.location.href).searchParams.get("reducedMotion");
  return param === "1" || param === "true";
}

/** Long frames are clamped so a resumed tab doesn't skip every effect to its end in one step. */
const MAX_FX_SECONDS = 0.1;

const root = document.querySelector<HTMLElement>('[data-testid="game"]')!;
const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
const seed = resolveSeed();
const motionForced = urlForcesReducedMotion();
const osReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Reading the `localStorage` global itself throws in some sandboxes, so it is touched only inside calls that prefs guards. */
const storage = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
let prefs = loadPrefs(storage, { volume: 0.6, reducedMotion: osReducedMotion, palette: "neon" });
let screen: Screen = initialScreen;
const settings = { ...defaultSettings, fx: { ...defaultSettings.fx } };
const renderer = createRenderer(canvas, settings);
const input = createInput(canvas, renderer.viewport);
const hud = createHud(root, settings);

let fx = createEffects(seed);
let fxEvents: GameEvent[] = [];
let lastFrame: number | undefined;
root.dataset.shake = "false";
const logo = root.querySelector<HTMLCanvasElement>('[data-testid="title-logo"]')!;
const sfx = createSfx();

const game = startGame({
  seed,
  settings,
  readInput: input.read,
  paused: true,
  onFrame(state, now) {
    const dt = game.paused ? 0 : Math.min(Math.max(0, (now - (lastFrame ?? now)) / 1000), MAX_FX_SECONDS);
    frameEffects(fx, fxEvents, dt, settings);
    fxEvents = [];
    lastFrame = now;
    const palette = palettes[prefs.palette];
    renderer.draw(state, now, fx, palette);
    hud.update(state, palette);
    const shaking = String(fx.trauma > 0);
    if (root.dataset.shake !== shaking) root.dataset.shake = shaking;
  },
});

for (const type of ["bugHit", "bugKilled", "shotFired", "pylonHit", "shieldBlocked"] as const) {
  game.on(type, (event) => fxEvents.push(event));
}
for (const type of ["shotFired", "bugKilled", "pylonHit", "gameOver"] as const) game.on(type, sfx.play);

const menus = createMenus(root, {
  act,
  change(patch) {
    applyPrefs({ ...prefs, ...patch });
    savePrefs(storage, prefs);
  },
});

function applyPrefs(next: Prefs): void {
  prefs = next;
  settings.fx.reducedMotion = motionForced || prefs.reducedMotion;
  sfx.setVolume(prefs.volume);
  menus.showPrefs(prefs, motionForced);
  redrawLogo();
}

function act(action: ScreenAction): void {
  screen = nextScreen(screen, action, game.state.phase === "gameOver");
  game.setPaused(screen.kind !== "playing");
  menus.show(screen);
  redrawLogo();
}

function redrawLogo(): void {
  if (!logo.closest("[hidden]")) drawLogo(logo, palettes[prefs.palette]);
}

const leaderboard = createLeaderboardPanel(root.querySelector('[data-testid="leaderboard"]')!);
game.on("gameOver", ({ score, wave }) => leaderboard.show({ id: newRunId(), score, wave }));

function restart(): void {
  game.restart();
  fx = createEffects(seed);
  fxEvents = [];
  leaderboard.reset();
}

root.querySelector('[data-testid="restart"]')!.addEventListener("click", restart);
window.addEventListener("keydown", (e) => {
  sfx.resume();
  if (e.code === "KeyR" && !e.repeat && screen.kind === "playing" && !(e.target instanceof HTMLInputElement)) restart();
  if (e.code === "Escape") act("escape");
  const onTitle = screen.kind === "menu" && screen.menu === "title" && !screen.settings;
  // A focused button already acts on Enter; starting here too would swallow its click.
  if ((e.code === "Enter" || e.code === "NumpadEnter") && onTitle && !(e.target instanceof HTMLButtonElement)) act("start");
});
window.addEventListener("pointerdown", () => sfx.resume());
window.addEventListener("resize", redrawLogo);
applyPrefs(prefs);
menus.show(screen);

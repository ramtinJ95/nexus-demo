import "./style.css";
import "./touch.css";
import { createAudio, soundedEvents } from "./audio";
import { dailySeed, dayOf, type Day, type Mode } from "./daily";
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
let prefs = loadPrefs(storage, { musicVolume: 0.5, sfxVolume: 0.6, reducedMotion: osReducedMotion, palette: "neon" });
let screen: Screen = initialScreen;
let mode: Mode = { kind: "classic" };
const settings = { ...defaultSettings, fx: { ...defaultSettings.fx } };
const renderer = createRenderer(canvas, settings);
const input = createInput(root, canvas, renderer.viewport);
const hud = createHud(root, settings);

let fx = createEffects(seed);
let fxEvents: GameEvent[] = [];
let lastFrame: number | undefined;
root.dataset.shake = "false";
const logo = root.querySelector<HTMLCanvasElement>('[data-testid="title-logo"]')!;
const audio = createAudio();

const game = startGame({
  seed,
  settings,
  readInput: () => input.read(game.state.drone.pos),
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
    audio.setMusic(screen.kind === "playing" && state.phase === "playing" ? state.wave.number : null);
    const music = String(audio.level ?? "off");
    if (root.dataset.music !== music) root.dataset.music = music;
    if (root.dataset.audio !== audio.state) root.dataset.audio = audio.state;
  },
});

for (const type of ["bugHit", "bugKilled", "shotFired", "pylonHit", "shieldBlocked"] as const) {
  game.on(type, (event) => fxEvents.push(event));
}
for (const type of soundedEvents) game.on(type, audio.play);

const menus = createMenus(root, {
  act,
  change(patch) {
    applyPrefs({ ...prefs, ...patch });
    savePrefs(storage, prefs);
  },
  daily() {
    const day = labelToday();
    mode = { kind: "daily", day };
    showMode();
    restart(dailySeed(day));
    act("start");
  },
});

const dailyButton = root.querySelector<HTMLElement>('[data-testid="start-daily"]')!;
const hudMode = root.querySelector<HTMLElement>('[data-testid="hud-mode"]')!;

/** The label and the run read one `dayOf` call, so a click never starts a day other than the one shown. */
function labelToday(): Day {
  const day = dayOf(new Date());
  const label = `Daily ${day}`;
  if (dailyButton.textContent !== label) dailyButton.textContent = label;
  return day;
}
// A title screen left open, or a tab resumed, across midnight UTC relabels within a second.
setInterval(labelToday, 1000);
labelToday();

function showMode(): void {
  root.dataset["mode"] = mode.kind;
  hudMode.hidden = mode.kind === "classic";
  hudMode.textContent = mode.kind === "daily" ? `DAILY ${mode.day}` : "";
}

function applyPrefs(next: Prefs): void {
  prefs = next;
  settings.fx.reducedMotion = motionForced || prefs.reducedMotion;
  audio.setVolumes({ music: prefs.musicVolume, sfx: prefs.sfxVolume });
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
game.on("gameOver", ({ score, wave }) =>
  leaderboard.show({ id: newRunId(), score, wave, day: mode.kind === "daily" ? mode.day : null }),
);

function restart(nextSeed = game.state.seed): void {
  game.restart(nextSeed);
  fx = createEffects(nextSeed);
  fxEvents = [];
  leaderboard.reset();
}

root.querySelector('[data-testid="restart"]')!.addEventListener("click", () => restart());
window.addEventListener("keydown", (e) => {
  audio.unlock();
  if (e.code === "KeyR" && !e.repeat && screen.kind === "playing" && !(e.target instanceof HTMLInputElement)) restart();
  if (e.code === "Escape" && !e.repeat) act("escape");
  const onTitle = screen.kind === "menu" && screen.menu === "title" && !screen.settings;
  // A focused button already acts on Enter; starting here too would swallow its click.
  if ((e.code === "Enter" || e.code === "NumpadEnter") && onTitle && !(e.target instanceof HTMLButtonElement)) act("start");
});
window.addEventListener("pointerdown", () => audio.unlock());
window.addEventListener("resize", redrawLogo);
applyPrefs(prefs);
showMode();
menus.show(screen);

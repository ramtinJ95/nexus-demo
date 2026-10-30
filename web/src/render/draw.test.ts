import { describe, expect, it } from "vitest";
import { createEffects } from "../fx/effects";
import { enemyTypes } from "../sim/enemies";
import { defaultSettings, type Settings } from "../sim/settings";
import { createGame } from "../sim/step";
import { createRenderer } from "./draw";
import { palettes } from "./palette";

/** A 2D context that records every color filled, so a test can see what each frame painted. */
function recordingCanvas(fills: string[]): HTMLCanvasElement {
  let fillStyle = "";
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key === "fillStyle" ? fillStyle : key in target ? target[key] : () => {}),
    set: (target, key, value) => {
      if (key === "fillStyle") fillStyle = value;
      else target[key] = value;
      return true;
    },
  });
  const record = () => fills.push(fillStyle);
  Object.assign(ctx, { fill: record, fillRect: record });
  return { clientWidth: 1280, clientHeight: 720, width: 1280, height: 720, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

/** For each tick of a boss windup, whether that frame painted anything pure white. */
function whiteFrames(settings: Settings): boolean[] {
  (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
  const fills: string[] = [];
  const renderer = createRenderer(recordingCanvas(fills), settings);
  const state = createGame(1, settings);
  state.bugs.push({ id: 1, kind: "boss", pos: { x: 300, y: 300 }, hp: enemyTypes.boss.hp, latched: false, facing: { x: 1, y: 0 }, dash: { phase: "windup", left: 1 }, broodIn: 0 });
  return Array.from({ length: 12 }, (_, tick) => {
    state.tick = tick;
    fills.length = 0;
    renderer.draw(state, 0, createEffects(1), palettes.neon);
    return fills.includes("#ffffff");
  });
}

describe("boss windup", () => {
  it("flashes white while the boss winds up", () => {
    const frames = whiteFrames(defaultSettings);
    expect(frames).toContain(true);
    expect(frames).toContain(false);
  });

  it("holds a steady white instead of flashing under reduced motion", () => {
    const frames = whiteFrames({ ...defaultSettings, fx: { ...defaultSettings.fx, reducedMotion: true } });
    expect(frames.every(Boolean)).toBe(true);
  });
});

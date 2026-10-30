import { describe, expect, it } from "vitest";
import { initialScreen, nextScreen, type Screen, type ScreenAction } from "./screen";

const run = (actions: ScreenAction[], gameOver = false, from: Screen = initialScreen) =>
  actions.reduce((screen, action) => nextScreen(screen, action, gameOver), from);

const playing: Screen = { kind: "playing" };
const pause: Screen = { kind: "menu", menu: "pause", settings: false };

describe("screen", () => {
  it("opens on the title screen and starts playing on start", () => {
    expect(initialScreen).toEqual({ kind: "menu", menu: "title", settings: false });
    expect(run(["start"])).toEqual(playing);
  });

  it("ignores escape and resume on the title screen", () => {
    expect(run(["escape", "resume"])).toEqual(initialScreen);
  });

  it("escape pauses a run and escape or resume returns to it", () => {
    expect(run(["start", "escape"])).toEqual(pause);
    expect(run(["start", "escape", "escape"])).toEqual(playing);
    expect(run(["start", "escape", "resume"])).toEqual(playing);
  });

  it("escape does nothing once the run is over", () => {
    expect(run(["escape"], true, playing)).toEqual(playing);
  });

  it("settings open over the menu they came from, and escape closes them before it resumes", () => {
    expect(run(["openSettings"])).toEqual({ kind: "menu", menu: "title", settings: true });
    expect(run(["openSettings", "escape"])).toEqual(initialScreen);
    expect(run(["openSettings", "closeSettings"])).toEqual(initialScreen);
    expect(run(["escape", "openSettings"], false, playing)).toEqual({ kind: "menu", menu: "pause", settings: true });
    expect(run(["escape", "openSettings", "escape"], false, playing)).toEqual(pause);
  });

  it("start and resume do nothing while settings are open", () => {
    expect(run(["openSettings", "start"])).toEqual({ kind: "menu", menu: "title", settings: true });
    expect(run(["escape", "openSettings", "resume"], false, playing)).toEqual({ kind: "menu", menu: "pause", settings: true });
  });

  it("menu actions do nothing while playing", () => {
    expect(run(["start", "resume", "openSettings", "closeSettings"], false, playing)).toEqual(playing);
  });
});

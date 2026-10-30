import type { Journey } from "../journey.ts";
import { fight } from "./game-feel.ts";

const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

export const musicAudio: Journey = {
  feature: "music-audio.md",
  description: "Check the audio stays locked until input, set and persist the music and effects volumes, then play until wave 2 raises the music level and pause to silence it.",
  async run({ page, open, shot, check, clip }) {
    const root = page.getByTestId("game");
    const attr = (name: string) => root.getAttribute(name);
    const text = (id: string) => page.getByTestId(id).textContent();
    const reaches = (selector: string, timeout = 3000) =>
      page.locator(`[data-testid="game"]${selector}`).waitFor({ timeout }).then(() => true, () => false);
    const fightUntil = async (done: () => Promise<boolean>, seconds: number, radii: number[], onTick?: (i: number) => Promise<void>) => {
      const deadline = Date.now() + seconds * 1000;
      for (let i = 0; !(await done()) && Date.now() < deadline; i++) await fight(page, 2.7, onTick, radii[i % radii.length]);
    };

    await open("/", { title: true });
    await reaches("[data-audio][data-music]");
    check((await attr("data-audio")) === "locked", "before any input the audio is locked");
    check((await attr("data-music")) === "off", "the title screen plays no music");

    await page.getByTestId("title-settings").click();
    check(await page.getByTestId("setting-music-volume").isVisible(), "the settings panel shows the Music slider");
    check(await page.getByTestId("setting-sfx-volume").isVisible(), "the settings panel shows the Effects slider");
    check((await attr("data-music-volume")) === "50" && (await text("setting-music-volume-value")) === "50%", "music volume starts at 50%");
    check((await attr("data-sfx-volume")) === "60" && (await text("setting-sfx-volume-value")) === "60%", "effects volume starts at 60%");
    await shot("01-settings-music-effects");

    const music = page.getByTestId("setting-music-volume");
    const effects = page.getByTestId("setting-sfx-volume");
    for (let i = 0; i < 2; i++) await music.press("ArrowRight");
    for (let i = 0; i < 4; i++) await effects.press("ArrowLeft");
    check((await attr("data-music-volume")) === "60" && (await text("setting-music-volume-value")) === "60%", "two ArrowRight presses raise the music to 60%");
    check((await attr("data-sfx-volume")) === "40" && (await text("setting-sfx-volume-value")) === "40%", "four ArrowLeft presses lower the effects to 40%");

    await open("/", { title: true });
    await reaches("[data-audio]");
    check((await attr("data-audio")) === "locked", "a reloaded page is locked again until input");
    await page.getByTestId("title-settings").click();
    check((await music.inputValue()) === "60" && (await attr("data-music-volume")) === "60", "the music volume survives a reload");
    check((await effects.inputValue()) === "40" && (await attr("data-sfx-volume")) === "40", "the effects volume survives a reload");
    await shot("02-settings-persisted");

    await reaches('[data-audio="running"]');
    const state = await attr("data-audio");
    check(state === "running", `after a click the audio runs (data-audio="${state}")`);
    check((await attr("data-music")) === "off", "settings over the title screen play no music");

    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="game"][data-screen="playing"]').waitFor();
    await reaches('[data-music="1"]');
    check((await attr("data-music")) === "1", "wave 1 plays music level 1");

    const read = () =>
      page.evaluate(() => ({
        wave: document.querySelector('[data-testid="hud-wave"]')?.textContent ?? "",
        score: document.querySelector('[data-testid="hud-score"]')?.textContent ?? "",
        music: document.querySelector<HTMLElement>('[data-testid="game"]')?.dataset["music"] ?? "",
      }));
    const wave1Music = new Set<string>();
    let clipping = false;
    let leveled = false;
    // The clip starts with one wave 1 bug left and the pause runs inside the sweep, so the level change, the pause and the resumed play fit in the 8 second GIF.
    await fightUntil(
      async () => leveled,
      60,
      [200, 70],
      async () => {
        if (leveled) return;
        const now = await read();
        if (number(now.wave) === 1) wave1Music.add(now.music);
        if (!clipping && (now.music === "2" || number(now.score) >= 5)) {
          clip.start();
          clipping = true;
        }
        if (now.music !== "2") return;
        leveled = true;
        await shot("03-wave-2-music-level-2");
        check(number(now.wave) === 2, "clearing wave 1 raises the music to level 2 for wave 2");
        await page.keyboard.press("Escape");
        check((await attr("data-screen")) === "paused", "Escape pauses the run");
        check(await reaches('[data-music="off"]', 1000), "the pause overlay silences the music");
        await shot("04-paused-music-off");
        await page.waitForTimeout(600);
        await page.keyboard.press("Escape");
        check(await reaches('[data-music="2"]', 1000), "resuming brings the wave 2 music back");
      },
    );
    await fight(page, 1);
    clip.stop();
    check(leveled, "the music reaches level 2 within 60 seconds of fighting");
    check(wave1Music.size === 1 && wave1Music.has("1"), `wave 1 plays only music level 1 (saw ${[...wave1Music].join(", ")})`);
  },
};

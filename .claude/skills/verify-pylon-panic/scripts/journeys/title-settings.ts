import type { Journey } from "../journey.ts";
import { fight } from "./game-feel.ts";

const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

export const titleSettings: Journey = {
  feature: "title-settings.md",
  description: "Open on the title screen, change volume, colorblind colors and reduced motion, reload to see them kept, then play, pause with Escape and resume.",
  async run({ page, open, shot, check, clip }) {
    const root = page.getByTestId("game");
    const attr = (name: string) => root.getAttribute(name);
    const hud = (id: string) => page.getByTestId(id).textContent();
    const frozen = async () => [await hud("hud-score"), await hud("hud-integrity"), await hud("hud-countdown"), await hud("hud-wave")].join("|");

    await open("/", { title: true });
    check(await page.getByTestId("title-screen").isVisible(), "a fresh page opens on the title screen");
    check((await attr("data-screen")) === "title", "the game root reports the title screen");
    check(await page.getByTestId("how-to-play").isVisible(), "the title screen shows how to play");
    const lit = await page.getByTestId("title-logo").evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
      return count / (data.length / 4);
    });
    check(lit > 0.02, `the logo canvas is drawn (${(lit * 100).toFixed(1)}% of its pixels lit)`);
    const before = await frozen();
    await page.waitForTimeout(2000);
    check((await frozen()) === before, "the run does not advance behind the title screen");
    check(number(await hud("hud-score")) === 0 && number(await hud("hud-integrity")) === 100, "behind the title the score is 0 and the pylon is untouched");
    await shot("01-title");

    await page.getByTestId("title-settings").click();
    check(await page.getByTestId("settings").isVisible(), "the settings button opens the settings panel");
    check((await attr("data-screen")) === "title" && (await attr("data-settings")) === "true", "settings open over the title screen");
    check((await attr("data-volume")) === "60" && (await page.getByTestId("setting-volume-value").textContent()) === "60%", "volume starts at 60%");
    check((await attr("data-palette")) === "neon" && (await attr("data-reduced-motion")) === "false", "the neon palette and full motion are the defaults");
    await shot("02-settings");

    const volume = page.getByTestId("setting-volume");
    await volume.press("ArrowLeft");
    await volume.press("ArrowLeft");
    await page.getByTestId("setting-colorblind").click();
    await page.getByTestId("setting-reduced-motion").click();
    check((await attr("data-volume")) === "50" && (await page.getByTestId("setting-volume-value").textContent()) === "50%", "two ArrowLeft presses lower the volume to 50%");
    check((await attr("data-palette")) === "colorblind", "the colorblind checkbox switches to the colorblind palette");
    check((await attr("data-reduced-motion")) === "true", "the reduced-motion checkbox turns reduced motion on");

    await open("/", { title: true });
    await page.getByTestId("title-settings").click();
    check((await volume.inputValue()) === "50" && (await attr("data-volume")) === "50", "the volume survives a reload");
    check((await page.getByTestId("setting-colorblind").isChecked()) && (await attr("data-palette")) === "colorblind", "the colorblind palette survives a reload");
    check((await page.getByTestId("setting-reduced-motion").isChecked()) && (await attr("data-reduced-motion")) === "true", "reduced motion survives a reload");
    await shot("03-settings-persisted");

    await page.keyboard.press("Escape");
    check((await attr("data-settings")) === "false" && (await attr("data-screen")) === "title", "Escape closes settings back to the title screen");
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="game"][data-screen="playing"]').waitFor();
    check(await page.getByTestId("title-screen").isHidden(), "Enter on the title screen starts the run");
    const score = async () => number(await hud("hud-score"));
    // Every fight restarts its sweep at angle 0, so each pass is a full turn. The tight sweep reaches bugs latched behind the pylon.
    const fightUntil = async (done: () => Promise<boolean>, seconds: number, radii: number[]) => {
      const deadline = Date.now() + seconds * 1000;
      for (let i = 0; !(await done()) && Date.now() < deadline; i++) await fight(page, 2.7, undefined, radii[i % radii.length]);
    };
    await fightUntil(async () => (await score()) > 0, 20, [200]);
    check((await score()) > 0, "the colorblind run plays and bugs die");

    clip.start();
    await fight(page, 1, async (i) => {
      if (i === 10) await shot("04-colorblind-play");
    });
    await page.keyboard.press("Escape");
    check((await attr("data-screen")) === "paused" && (await page.getByTestId("pause-overlay").isVisible()), "Escape pauses the run and shows the pause overlay");
    const paused = await frozen();
    await page.waitForTimeout(1500);
    check((await frozen()) === paused, "score, integrity and the wave stay frozen while paused");
    await shot("05-paused");
    await page.keyboard.press("Escape");
    check((await attr("data-screen")) === "playing" && (await page.getByTestId("pause-overlay").isHidden()), "Escape on the pause overlay resumes the run");
    const pausedScore = await score();
    await fightUntil(async () => (await score()) > pausedScore, 10, [70, 200]);
    clip.stop();
    check((await score()) > pausedScore, "the run advances again after resuming");
  },
};

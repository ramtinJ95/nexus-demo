import type { Journey } from "../journey.ts";

const ARENA = { width: 1280, height: 720 };
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

export const coreLoop: Journey = {
  feature: "core-loop.md",
  description: "Move, aim and shoot through the first waves, let the pylon fall, then restart.",
  async run({ page, open, shot, check, clip }) {
    await open();
    const root = page.getByTestId("game");
    const hud = (id: string) => page.getByTestId(id).textContent();
    check((await root.getAttribute("data-phase")) === "playing", "a fresh page starts in the playing phase");
    check(number(await hud("hud-wave")) === 1, "the run starts on wave 1");
    check(number(await hud("hud-score")) === 0, "the run starts with score 0");
    await shot("01-start");

    const box = await page.locator("canvas").boundingBox();
    if (!box) throw new Error("canvas has no layout box");
    const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const aimAt = (angle: number, radius: number) =>
      page.mouse.move(center.x + Math.cos(angle) * radius * scale, center.y + Math.sin(angle) * radius * scale);

    const moves = ["KeyW", "KeyD", "KeyS", "KeyA"];
    await aimAt(0, 220);
    await page.waitForTimeout(1500);
    clip.start();
    await page.mouse.down();
    for (let i = 0; i < 160; i++) {
      await aimAt(i * 0.12, 260);
      if (i % 40 === 0) await page.keyboard.down(moves[(i / 40) % 4]!);
      if (i % 40 === 20) await page.keyboard.up(moves[((i - 20) / 40) % 4]!);
      if (i === 100) await shot("02-firefight");
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    clip.stop();
    check(number(await hud("hud-score")) > 0, "shooting with the mouse kills bugs and raises the score");

    await page.locator('[data-testid="game"][data-phase="gameOver"]').waitFor({ timeout: 120_000 });
    check(number(await hud("hud-integrity")) === 0, "the run ends when pylon integrity reaches 0");
    check(await page.getByTestId("game-over").isVisible(), "the game over panel is shown");
    await shot("03-game-over");

    await page.keyboard.press("KeyR");
    await page.locator('[data-testid="game"][data-phase="playing"]').waitFor();
    check(number(await hud("hud-score")) === 0, "R restarts the run with score 0");
    check(number(await hud("hud-wave")) === 1, "R restarts the run on wave 1");
    await shot("04-restarted");
  },
};

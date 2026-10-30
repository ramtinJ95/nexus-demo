import type { Device, Journey } from "../journey.ts";
import { touchscreen } from "../touch.ts";

const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);
const MOVE = 1;
const AIM = 2;

function touchJourney(orientation: "portrait" | "landscape", device: Device): Journey {
  return {
    feature: "touch-controls.md",
    device,
    description: `On a ${device.width}x${device.height} phone, move and auto-fire with the twin sticks, lift the aim thumb, then restart by tap.`,
    async run({ page, open, shot, check, clip }) {
      await open();
      const root = page.getByTestId("game");
      const hud = (id: string) => page.getByTestId(id).textContent();
      const stick = (side: "move" | "aim") => page.getByTestId(`touch-stick-${side}`);
      const box = async (selector: string) => {
        const b = await page.locator(selector).boundingBox();
        if (!b) throw new Error(`${selector} has no layout box`);
        return b;
      };
      check((await root.getAttribute("data-touch")) === "true", "a touch device shows the virtual sticks");
      check((await stick("move").isVisible()) && (await stick("aim").isVisible()), "both sticks rest on screen before a touch");

      const canvas = await box('[data-testid="game"] > canvas');
      const hudBox = await box(".hud");
      check(await page.locator(".hud").evaluate((el) => el.scrollWidth <= el.clientWidth), "the HUD fits the screen width");
      if (orientation === "portrait") check(hudBox.y + hudBox.height <= canvas.y + 1, "in portrait the arena sits below the HUD");
      check(canvas.y + canvas.height <= device.height && canvas.x + canvas.width <= device.width, "the arena fits the screen");
      await shot(`01-${orientation}-start`);

      const rest = async (side: "move" | "aim") => {
        const b = await stick(side).boundingBox();
        if (!b) throw new Error(`${side} stick has no layout box`);
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      };
      const moveAt = await rest("move");
      const aimAt = await rest("aim");
      const touch = await touchscreen(page);
      const around = (c: { x: number; y: number }, angle: number, r: number) => ({ x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r });

      await page.waitForTimeout(1500);
      clip.start();
      await touch.down(MOVE, moveAt);
      await touch.down(AIM, aimAt);
      check((await stick("move").getAttribute("data-active")) === "true", "the left thumb takes the move stick");
      check((await stick("aim").getAttribute("data-active")) === "true", "the right thumb takes the aim stick");
      for (let i = 0; i < 110; i++) {
        await touch.move(MOVE, around(moveAt, Math.floor(i / 25) * (Math.PI / 2) - Math.PI / 2, 50));
        await touch.move(AIM, around(aimAt, i * 0.12, 50));
        if (i === 70) await shot(`02-${orientation}-firefight`);
        await page.waitForTimeout(50);
      }
      check(number(await hud("hud-score")) > 0, "holding the aim stick fires on its own and kills bugs");

      await touch.up(AIM);
      check((await stick("aim").getAttribute("data-active")) === "false", "lifting the right thumb releases the aim stick");
      await page.waitForTimeout(1000);
      const scoreAfterLift = number(await hud("hud-score"));
      await page.waitForTimeout(1500);
      clip.stop();
      await touch.up(MOVE);
      check(number(await hud("hud-score")) === scoreAfterLift, "the drone stops firing once the aim thumb lifts");

      await page.locator('[data-testid="game"][data-phase="gameOver"]').waitFor({ timeout: 120_000 });
      check(!(await stick("aim").isVisible()), "the sticks hide on the game over panel");
      const restart = page.getByTestId("restart");
      await restart.scrollIntoViewIfNeeded();
      check(await restart.isVisible(), "the restart button is reachable on the game over panel");
      await shot(`03-${orientation}-game-over`);
      const r = await restart.boundingBox();
      if (!r) throw new Error("restart has no layout box");
      await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
      await page.locator('[data-testid="game"][data-phase="playing"]').waitFor();
      check(number(await hud("hud-score")) === 0, "tapping restart starts a new run");
    },
  };
}

export const touchPortrait = touchJourney("portrait", { width: 390, height: 844, touch: true });
export const touchLandscape = touchJourney("landscape", { width: 844, height: 390, touch: true });

import type { Journey, JourneyContext } from "../journey.ts";

const ARENA = { width: 1280, height: 720 };
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

declare global {
  interface Window {
    shakeSeen?: boolean;
  }
}

async function watchShake(page: JourneyContext["page"]): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="game"]')!;
    window.shakeSeen = root.dataset["shake"] === "true";
    new MutationObserver(() => {
      if (root.dataset["shake"] === "true") window.shakeSeen = true;
    }).observe(root, { attributes: true, attributeFilter: ["data-shake"] });
  });
}

async function fight(page: JourneyContext["page"], seconds: number, onTick?: (i: number) => Promise<void>): Promise<void> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas has no layout box");
  const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const aimAt = (angle: number, radius: number) =>
    page.mouse.move(center.x + Math.cos(angle) * radius * scale, center.y + Math.sin(angle) * radius * scale);
  await aimAt(0, 220);
  await page.mouse.down();
  for (let i = 0; i < seconds * 20; i++) {
    await aimAt(i * 0.12, 200);
    await onTick?.(i);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
}

export const gameFeel: Journey = {
  feature: "game-feel.md",
  description: "Fight to see sparks, flashes and death bursts, let a bug latch to shake the screen, then repeat with reduced motion.",
  async run({ page, open, shot, check, clip }) {
    const root = page.getByTestId("game");
    const hud = (id: string) => page.getByTestId(id).textContent();

    await open();
    check((await root.getAttribute("data-reduced-motion")) === "false", "full motion is on when the player has no reduced-motion preference");
    await watchShake(page);
    await page.waitForTimeout(2500);
    let hitShot = false;
    const shootFirstShake = async () => {
      if (hitShot || !(await page.evaluate(() => window.shakeSeen === true))) return;
      hitShot = true;
      await shot("02-pylon-hit-shake-pulse");
    };
    clip.start();
    await fight(page, 7, async (i) => {
      if (i === 70) await shot("01-firefight-particles-flashes");
      await shootFirstShake();
    });
    clip.stop();
    check(number(await hud("hud-score")) > 0, "bullets hit and kill bugs during the firefight");
    if (!hitShot) {
      await page.locator('[data-testid="game"][data-shake="true"]').waitFor({ timeout: 60_000 });
      await shootFirstShake();
    }
    check(number(await hud("hud-integrity")) < 100, "a latched bug damages the pylon");
    check(await page.evaluate(() => window.shakeSeen === true), "pylon damage shakes the screen");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await open();
    check((await root.getAttribute("data-reduced-motion")) === "true", "the OS reduced-motion preference turns reduced motion on");
    await watchShake(page);
    await page.waitForTimeout(2500);
    let reducedHitShot = false;
    const shootFirstDamage = async () => {
      if (reducedHitShot || number(await hud("hud-integrity")) >= 100) return;
      reducedHitShot = true;
      await shot("04-reduced-motion-pylon-hit");
    };
    await fight(page, 7, async (i) => {
      if (i === 50) await shot("03-reduced-motion-firefight");
      await shootFirstDamage();
    });
    if (!reducedHitShot) {
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="hud-integrity"]')?.textContent ?? "100";
        return Number(text) < 100;
      }, undefined, { timeout: 60_000 });
      await shootFirstDamage();
    }
    await page.waitForTimeout(1000);
    check(await page.evaluate(() => window.shakeSeen === false), "with reduced motion, pylon damage does not shake the screen");
  },
};

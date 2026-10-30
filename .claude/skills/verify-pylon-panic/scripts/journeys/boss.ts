import type { Journey } from "../journey.ts";
import { player } from "./enemy-variety.ts";

const ARENA = { width: 1280, height: 720 };
const BOSS_WAVE = 5;
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

export const boss: Journey = {
  feature: "boss.md",
  description: "Play to wave 5, which ends with a boss. Fight it through both phases while it telegraphs charges, then clear the wave.",
  async run({ page, open, shot, check, clip, save }) {
    await open();
    const game = page.getByTestId("game");
    const hud = page.getByTestId("hud-boss");
    const hudWave = async () => number(await page.getByTestId("hud-wave").textContent());
    const alive = async () => (await game.getAttribute("data-phase")) === "playing";
    const bossShown = () => hud.isVisible();
    const attr = async (name: string) => (await hud.getAttribute(name)) ?? "";
    const barWidth = async () => (await page.getByTestId("hud-boss-bar").evaluate((el) => (el as HTMLElement).style.width)) || "";

    const play = player(page);
    await play.start();
    await play.until(async () => (await hudWave()) >= BOSS_WAVE || !(await alive()), 240_000);
    check(await alive(), `the drone holds the pylon until wave ${BOSS_WAVE}`);
    await play.until(async () => (await bossShown()) || !(await alive()), 90_000);
    check(await alive(), `the drone holds the pylon through wave ${BOSS_WAVE}'s regular bugs`);
    check(await bossShown(), `wave ${BOSS_WAVE} ends with a boss`);
    check((await hudWave()) === BOSS_WAVE, `the boss arrives in wave ${BOSS_WAVE}`);
    check((await attr("data-phase")) === "1", "the boss starts in phase 1");
    check((await barWidth()) === "100%", "the boss health bar starts full");
    await shot("01-boss-health-bar");

    const box = await page.locator('[data-testid="game"] > canvas').boundingBox();
    if (!box) throw new Error("canvas has no layout box");
    const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
    const toPage = (x: number, y: number) => ({ x: box.x + box.width / 2 + (x - ARENA.width / 2) * scale, y: box.y + box.height / 2 + (y - ARENA.height / 2) * scale });

    const seen = { telegraph: { 1: false, 2: false }, enraged: false, hp: [] as number[] };
    const fightStart = Date.now();
    let enragedAt: number | undefined;
    clip.start();
    const fought = await play.until(async () => {
      if (!(await bossShown())) return true;
      if (!(await alive())) return true;
      const target = toPage(number(await attr("data-x")), number(await attr("data-y")));
      await page.mouse.move(target.x, target.y);
      const phase = (await attr("data-phase")) === "2" ? 2 : 1;
      seen.hp.push(number(await attr("data-hp")));
      if ((await attr("data-move")) === "windup" && !seen.telegraph[phase]) {
        seen.telegraph[phase] = true;
        await shot(`0${phase === 1 ? 2 : 4}-boss-telegraph-phase-${phase}`);
      }
      if (phase === 2 && !seen.enraged) {
        seen.enraged = true;
        enragedAt = Date.now();
        await shot("03-boss-phase-2");
      }
      return false;
    }, 60_000);
    clip.stop();
    const fightMs = Date.now() - fightStart;
    save("boss-fight", { fightMs, enragedAfterMs: enragedAt && enragedAt - fightStart, telegraphs: seen.telegraph, hpSamples: seen.hp.length, lowestHp: Math.min(...seen.hp) });

    check(fought && (await alive()), "the drone kills the boss before the pylon falls");
    check(seen.telegraph[1], "the boss telegraphs a charge in phase 1");
    check(seen.enraged, "the boss enters phase 2 at half health");
    check(seen.telegraph[2], "the boss telegraphs a charge in phase 2");
    check(!(await bossShown()), "the boss health bar goes away when the boss dies");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4 * scale);
    await play.until(async () => (await hudWave()) > BOSS_WAVE || !(await alive()), 60_000);
    check((await hudWave()) > BOSS_WAVE && (await alive()), `wave ${BOSS_WAVE} clears once the boss and its brood are dead`);
    await shot("05-wave-5-cleared");
    await page.mouse.up();
  },
};

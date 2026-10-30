import type { Page } from "playwright";
import type { Journey } from "../journey.ts";

const ARENA = { width: 1280, height: 720 };
const DAY = "2026-10-30";
const NAME = "DAYLY";
const RIVALS = [
  { name: "CLASSIC", score: 999, wave: 9 },
  { name: "DAILY-1", score: 1, wave: 1, day: DAY },
  { name: "YESTERDAY", score: 500, wave: 5, day: "2026-10-29" },
];
// The HUD redraws on the next animation frame, not on the click that changed the run.
const nextFrame = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

async function dailySeedOn(page: Page, webUrl: string, now: string): Promise<string | null> {
  const other = await page.context().browser()!.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const player = await other.newPage();
    await player.clock.setFixedTime(new Date(now));
    await player.goto(`${webUrl}/?seed=1337`);
    await player.locator('[data-testid="game"][data-screen="title"]').waitFor();
    await player.getByTestId("start-daily").click();
    await player.locator('[data-testid="game"][data-screen="playing"]').waitFor();
    await nextFrame(player);
    return await player.getByTestId("hud-seed").textContent();
  } finally {
    await other.close();
  }
}

export const daily: Journey = {
  feature: "daily.md",
  description: "Start the daily challenge, see two players on one UTC day share its seed, and submit to that day's board.",
  async run({ page, webUrl, seed, open, shot, save, check, clip }) {
    for (const rival of RIVALS) {
      check((await page.request.post(`${webUrl}/api/scores`, { data: rival })).status() === 201, `seeded ${rival.name} on the ${rival.day ?? "classic"} board`);
    }
    await page.clock.setFixedTime(new Date(`${DAY}T09:00:00Z`));
    await open(undefined, { title: true });
    const root = page.getByTestId("game");
    const dailyButton = page.getByTestId("start-daily");
    check((await dailyButton.textContent()) === `Daily ${DAY}`, "the title screen offers today's daily challenge by its UTC date");
    await shot("01-title");

    clip.start();
    await page.waitForTimeout(500);
    await dailyButton.click();
    await page.locator('[data-testid="game"][data-screen="playing"]').waitFor();
    await nextFrame(page);
    check((await root.getAttribute("data-mode")) === "daily", "the run is in daily mode");
    check((await page.getByTestId("hud-mode").textContent()) === `DAILY ${DAY}` && (await page.getByTestId("hud-mode").isVisible()), "the HUD shows DAILY and the date");
    const mySeed = await page.getByTestId("hud-seed").textContent();
    check(mySeed !== null && mySeed !== seed, `the daily seed ${mySeed} replaces the URL seed ${seed}`);

    const box = await page.locator('[data-testid="game"] > canvas').boundingBox();
    if (!box) throw new Error("canvas has no layout box");
    const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const aimAt = (angle: number, radius: number) =>
      page.mouse.move(center.x + Math.cos(angle) * radius * scale, center.y + Math.sin(angle) * radius * scale);
    await aimAt(0, 220);
    await page.mouse.down();
    for (let i = 0; i < 120; i++) {
      await aimAt(i * 0.12, 260);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    clip.stop();
    await shot("02-daily-run");

    const sameDay = await dailySeedOn(page, webUrl, `${DAY}T22:30:00Z`);
    check(sameDay === mySeed, `a second player later the same UTC day gets the same seed ${sameDay}`);
    const nextDay = await dailySeedOn(page, webUrl, "2026-10-31T09:00:00Z");
    check(nextDay !== null && nextDay !== mySeed, `a player on 2026-10-31 gets a different seed ${nextDay}`);

    await page.locator('[data-testid="game"][data-phase="gameOver"]').waitFor({ timeout: 120_000 });
    const finalScore = number(await page.getByTestId("final-score").textContent());
    const nameField = page.getByTestId("leaderboard-name");
    await nameField.click();
    await nameField.fill(NAME);
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="leaderboard"][data-state="board"]').waitFor();
    check((await page.getByTestId("leaderboard-title").textContent()) === `Daily ${DAY}`, "the board is titled with the day");
    check((await page.getByTestId("leaderboard").getAttribute("data-board")) === "daily", "the panel shows the daily board");

    const rows = await page.getByTestId("leaderboard-row").evaluateAll((els) =>
      els.map((el) => ({ mine: el.getAttribute("data-mine") === "true", cells: [...el.children].map((c) => c.textContent) })),
    );
    save("board", rows);
    const names = rows.map((r) => r.cells[1]);
    const mine = rows.filter((r) => r.mine);
    check(mine.length === 1 && mine[0]!.cells[1] === NAME && number(mine[0]!.cells[2]!) === finalScore, "the player's row is highlighted with the final score");
    check(names.includes("DAILY-1"), "the board lists today's rival");
    check(!names.includes("CLASSIC") && !names.includes("YESTERDAY"), "the board leaves out the classic board and yesterday's board");
    await shot("03-daily-board");

    const dailyScores = await (await page.request.get(`${webUrl}/api/scores?day=${DAY}`)).json();
    save("daily-scores", dailyScores);
    check(dailyScores.scores.some((s: { name: string; day: string }) => s.name === NAME && s.day === DAY), `GET /api/scores?day=${DAY} lists the run`);
    const classicScores = await (await page.request.get(`${webUrl}/api/scores`)).json();
    save("classic-scores", classicScores);
    check(!classicScores.scores.some((s: { name: string }) => s.name === NAME), "GET /api/scores, the classic board, does not list the daily run");

    await page.keyboard.press("KeyR");
    await page.locator('[data-testid="game"][data-phase="playing"]').waitFor();
    await nextFrame(page);
    check((await page.getByTestId("hud-seed").textContent()) === mySeed && (await root.getAttribute("data-mode")) === "daily", "R restarts the same daily challenge");
    await shot("04-daily-restart");
  },
};

import type { Journey } from "../journey.ts";
import { readStack } from "../stack.ts";

const ARENA = { width: 1280, height: 720 };
const NAME = "WARDS";
const RIVALS = [40, 26, 17, 11, 7, 4, 2, 1, 0, 0, 0].map((score, i) => ({ name: `RIVAL-${i + 1}`, score, wave: 1 + (score >> 3) }));
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

export const leaderboard: Journey = {
  feature: "leaderboard.md",
  description: "End a run, enter a name, see the top 10 with the player's row highlighted, then end a run with the API down.",
  async run({ page, webUrl, open, shot, save, check, clip, allowConsoleError }) {
    for (const rival of RIVALS) {
      check((await page.request.post(`${webUrl}/api/scores`, { data: rival })).status() === 201, `seeded ${rival.name} with ${rival.score}`);
    }
    await open();
    const root = page.getByTestId("game");
    const board = page.getByTestId("leaderboard");
    const nameField = page.getByTestId("leaderboard-name");
    const box = await page.locator('[data-testid="game"] > canvas').boundingBox();
    if (!box) throw new Error("canvas has no layout box");
    const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const aimAt = (angle: number, radius: number) =>
      page.mouse.move(center.x + Math.cos(angle) * radius * scale, center.y + Math.sin(angle) * radius * scale);

    await aimAt(0, 220);
    await page.mouse.down();
    for (let i = 0; i < 160; i++) {
      await aimAt(i * 0.12, 260);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    await shot("01-firefight");
    check(number(await page.getByTestId("hud-score").textContent()) > 0, "the fight scores, so the run beats the zero-score rivals");

    await page.waitForFunction(() => Number(document.querySelector('[data-testid="hud-integrity"]')?.textContent) <= 8, null, { timeout: 120_000 });
    clip.start();
    await page.locator('[data-testid="game"][data-phase="gameOver"]').waitFor({ timeout: 30_000 });
    const finalScore = number(await page.getByTestId("final-score").textContent());
    check((await board.getAttribute("data-state")) === "naming", "game over asks for a name");
    await page.waitForTimeout(600);
    await nameField.click();
    await nameField.pressSequentially(NAME, { delay: 140 });
    check((await nameField.inputValue()) === NAME, "W, A, R, D and S type into the name field instead of moving or restarting");
    check((await root.getAttribute("data-phase")) === "gameOver", "typing R in the name field does not restart the run");
    await shot("02-name-entered");
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="leaderboard"][data-state="board"]').waitFor();
    await page.waitForTimeout(1800);
    clip.stop();

    const rows = await page.getByTestId("leaderboard-row").evaluateAll((els) =>
      els.map((el) => ({ mine: el.getAttribute("data-mine") === "true", cells: [...el.children].map((c) => c.textContent) })),
    );
    save("board", rows);
    const mine = rows.filter((r) => r.mine);
    check(mine.length === 1 && mine[0]!.cells[1] === NAME && number(mine[0]!.cells[2]!) === finalScore, "exactly one row is highlighted, with the player's name and final score");
    check(rows.length === 10 && Number(mine[0]!.cells[0]!.slice(1)) <= 10, "the player's row is inside the top 10, which pushed the last rival off");
    check(rows.slice(0, 10).every((r, i) => r.cells[0] === `#${i + 1}`), "the top rows are ranked 1 to 10 in order");
    await shot("03-board");

    const stored = await (await page.request.get(`${webUrl}/api/scores?limit=100`)).json();
    save("scores", stored);
    check(stored.scores.some((s: { name: string; score: number }) => s.name === NAME && s.score === finalScore), "GET /api/scores lists the submitted run");

    const stack = readStack();
    if (!stack) throw new Error("no stack recorded");
    process.kill(-stack.pids.api, "SIGTERM");
    allowConsoleError(/^Failed to load resource: the server responded with a status of 50\d .*\/api\/(health|scores)$/);
    await page.waitForFunction(async () => (await fetch("/api/health")).status >= 500, null, { timeout: 10_000, polling: 250 });

    await page.keyboard.press("KeyR");
    await page.locator('[data-testid="game"][data-phase="playing"]').waitFor();
    check((await board.getAttribute("data-state")) === "hidden", "R after submitting restarts the run and hides the board");
    await page.locator('[data-testid="game"][data-phase="gameOver"]').waitFor({ timeout: 120_000 });
    check((await nameField.inputValue()) === NAME, "the next game over remembers the last name");
    await page.getByTestId("leaderboard-submit").click();
    await page.locator('[data-testid="leaderboard"][data-state="offline"]').waitFor({ timeout: 10_000 });
    check(await page.getByTestId("leaderboard-notice").isVisible(), "with the API down, the panel shows a visible offline notice");
    check(await page.getByTestId("leaderboard-submit").isEnabled(), "the offline panel keeps the form so the player can retry");
    await shot("04-api-down");

    await page.getByTestId("restart").click();
    await page.locator('[data-testid="game"][data-phase="playing"]').waitFor();
    check(number(await page.getByTestId("hud-score").textContent()) === 0, "restart still works with the API down");
  },
};

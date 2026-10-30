# Daily challenge

The title screen has a Daily button labeled with today's UTC date, such as `Daily 2026-10-30`. It starts a run whose seed comes from that date, so every player on the same UTC day faces the same waves. The HUD shows `DAILY 2026-10-30` above the seed. When the pylon falls, the score goes to that day's board, which is separate from the classic top 10 and from every other day's board.

## Sub-features

- `daily-start` starts a daily run from the `start-daily` button. Start and Enter still start a classic run with the URL seed.
- `daily-seed` derives the seed from the UTC date alone, so two players on one UTC day share it and the next day gets a new one. `hud-seed` shows that seed, not the URL seed.
- `daily-hud` sets `data-mode="daily"` on the game root and shows `hud-mode` with `DAILY` and the date. In classic, `data-mode="classic"` and `hud-mode` is hidden.
- `daily-restart` keeps the daily seed and mode when R or Restart starts the next run.
- `daily-board` submits a daily run to its day's board. The panel has `data-board="daily"` and `leaderboard-title` reads `Daily 2026-10-30`. A classic run shows `data-board="classic"` and `Top 10`.
- `daily-api` lists a day's board at `GET /api/scores?day=YYYY-MM-DD`. `GET /api/scores` lists only classic runs. A day that is not a real `YYYY-MM-DD` date answers 400.

## How to get to it (user POV)

- Load the game. On the title screen, choose `Daily <today>`.
- Play until integrity reaches 0, type a name, and press Enter. The board shows today's daily runs.
- Press R to try the same daily challenge again.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes, so the database is empty.

Run `npm run verify -- run daily`. The journey does the following.

- **Seed.** It posts `CLASSIC` (999) to the classic board, `DAILY-1` (1) to 2026-10-30, and `YESTERDAY` (500) to 2026-10-29 through `/api/scores`.
- **Title.** It fixes the page clock to 2026-10-30T09:00Z with `page.clock.setFixedTime` and loads the title screen. `start-daily` reads `Daily 2026-10-30`. Screenshot `01-title`.
- **Start.** The GIF covers the click on `start-daily` and a few seconds of firing in a circle. `data-mode` is `daily`, `hud-mode` reads `DAILY 2026-10-30`, and `hud-seed` differs from 1337. Screenshot `02-daily-run`.
- **Second player.** It opens a new browser context fixed to 22:30Z the same day and starts the daily run. Its `hud-seed` equals the first. A third context fixed to 2026-10-31 gets a different seed.
- **Board.** It lets the run fall, submits `DAYLY`, and waits for `data-state="board"`. `leaderboard-title` reads `Daily 2026-10-30`, `data-board` is `daily`, and the rows hold `DAYLY` (mine) and `DAILY-1` but not `CLASSIC` or `YESTERDAY`. Saved as `board.json`. Screenshot `03-daily-board`.
- **API.** `GET /api/scores?day=2026-10-30` lists `DAYLY` (`daily-scores.json`), and `GET /api/scores` does not (`classic-scores.json`).
- **Restart.** R starts a new run with the same seed and `data-mode="daily"`. Screenshot `04-daily-restart`.

## Gotchas

- The day is the UTC date, not the local one. Set the clock before the page loads, because the button's label is read at load.
- The title screen appears once per page load, so switching between classic and daily means reloading the page.
- The API accepts any real date. It does not check that the day is today.
- Same-seed determinism of the waves is covered by Vitest in `web/src/daily.test.ts`. Playwright input timing varies by a few frames, so the journey compares seeds across players, not arenas.

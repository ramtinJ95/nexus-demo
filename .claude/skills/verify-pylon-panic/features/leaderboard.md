# Leaderboard

When the pylon falls, the game over panel asks for a name. The player types one and submits. The panel then shows the top 10 runs with the player's row highlighted in magenta. A player outside the top 10 sees their row with its rank below the 10th row. If the API is down, the panel shows a red offline notice and keeps the form so the player can retry. Restart works in every state.

## Sub-features

- `board-name` shows a name field and a submit button on the game over panel. The field takes up to 16 characters and remembers the last name submitted in this browser.
- `board-typing` lets W, A, S, D, R, and the arrow keys type into the name field without moving the drone or restarting the run.
- `board-submit` posts the final score and wave on Enter or the submit button, then shows the top 10.
- `board-highlight` marks the player's row with `data-mine="true"`, inside the top 10 or appended below it with its rank.
- `board-offline` shows a visible notice when the API cannot be reached or answers 5xx. The form stays, so the player can retry, and restart still works.
- `board-rejected` shows the API's message when it rejects the name, for example a control character.

## How to get to it (user POV)

- Play until integrity reaches 0. The game over panel shows the name field.
- Type a name and press Enter, or choose Submit score.
- Press R or choose Restart to play again. The board hides.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes, so the database is empty.

Run `npm run verify -- run leaderboard`. The journey does the following.

- **Seed.** It posts 11 rivals with scores from 40 down to 0 through `/api/scores`, so a run with any kill places inside the top 10.
- **Fight.** It fires in a circle for 8 seconds, so `hud-score` is above 0. Screenshot `01-firefight`.
- **Fall.** It releases input. The GIF starts when `hud-integrity` reaches 8 and covers the fall, the name, and the board.
- **Name.** `[data-testid="leaderboard"]` has `data-state="naming"`. It clicks `leaderboard-name` and types `WARDS`. The field holds `WARDS` and `data-phase` stays `gameOver`. Screenshot `02-name-entered`.
- **Board.** It presses Enter. `data-state` becomes `board`, with 10 `leaderboard-row` items ranked `#1` to `#10` and one row with `data-mine="true"` that holds `WARDS` and the final score. Saved as `board.json`. Screenshot `03-board`. `GET /api/scores` lists the run, saved as `scores.json`.
- **API down.** It stops the stack's API process, and `/api/health` through the proxy answers 5xx. It presses R, lets the next run fall, and submits the remembered name. `data-state` becomes `offline`, and `leaderboard-notice` is visible. Screenshot `04-api-down`. Restart then starts a run with score 0.

## Gotchas

- Chromium logs `Failed to load resource ... 502` for every request to the stopped API. The journey calls `allowConsoleError` for that message only after it stops the API, so any earlier error still fails the run.
- The second run gets no input, so it takes about 60 seconds to fall. The journey waits up to 120 seconds.
- The field is not focused on game over, because R on the panel restarts the run. Click the field before typing.
- The outside-the-top-10 row and the rejected-name notice are covered by Vitest in `web/src/leaderboard.test.ts`, not by this journey.

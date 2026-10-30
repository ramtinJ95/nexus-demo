# Leaderboard API

The API stores run scores and lists the best ones. The game reaches it on its own origin under `/api`, through the Vite proxy. The [leaderboard](./leaderboard.md) on the game over panel uses it. This file proves the HTTP behavior on its own.

## Sub-features

- `api-health` answers `GET /api/health` with 200 `{ "ok": true }` once the database answers.
- `api-list` answers `GET /api/scores?limit=N` with `{ "scores": [...] }`, best score first. `limit` defaults to 10 and must be 1 to 100.
- `api-submit` stores `POST /api/scores` with `{ name, score, wave, runId? }` and answers 201 with `{ score, rank, top }`: the stored row, its 1-based rank, and the top 10, all from one read. A repeat with the same `runId` stores nothing and answers 200 with the first row's current rank and top 10.
- `api-validate` rejects with 400 a name that is empty or over 16 characters after trimming, a score that is not an integer from 0 to 1,000,000, and a wave that is not an integer from 1 to 10,000, and a `runId` that is not 8 to 64 letters, digits, `_`, or `-`.

## How to get to it (user POV)

- From the web origin, `GET` or `POST` `/api/...`. On the Nexus preview that is `<preview-url>/api/scores`.
- Directly on the API port, 8787 for the Nexus service or the port in `.verify/stack.json` for a verify stack.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes, so the database is empty.

Run `npm run verify -- run leaderboard-api`. The journey does the following through `page.request` on the web origin.

- **Health.** `GET /api/health` answers 200.
- **Empty.** `GET /api/scores` answers an empty list.
- **Submit.** It posts `"  Ada  "` with 42 on wave 5 and `Grace` with 99 on wave 7. Both answer 201, and the first is stored as `Ada`. Saved as `posts.json`.
- **Reject.** A 17 character name and a negative score answer 400.
- **List.** `GET /api/scores?limit=10` lists `Grace` then `Ada`. Saved as `scores.json`. `limit=0` answers 400.
- **Proof.** The page opens `/api/scores?limit=10`. Screenshot `scores-json`.

## Gotchas

- A database that is not empty breaks the ordering check. Always start from `up`, which empties `.verify/data/`.
- `POST` needs `content-type: application/json`. Playwright sets it when you pass `data` as an object.

# Pylon Panic

Pylon Panic is a neon twin-stick arena survival game. A drone defends a pylon at the arena's center from waves of bugs. Agent threads on Nexus build it, one feature per thread and one VM per thread, and Astra reviews every pull request. This file is the convention every thread follows.

## Layout

- `web/` is the game, built with Vite and plain Canvas 2D.
  - `web/src/sim/` is the simulation. It is pure TypeScript with no DOM, and Vitest tests it.
  - `web/src/sim/enemies.ts` is the enemy registry. Add an enemy kind to the `EnemyKind` union and one entry there.
  - `web/src/sim/settings.ts` holds every tunable in `defaultSettings`. Sim code takes `Settings` as a parameter.
  - `web/src/game.ts` runs the fixed-timestep loop. Subscribe to sim events with `game.on("gameOver", handler)`, and the same for every `GameEvent` type.
  - `web/src/render/` draws the state, and the HUD is DOM with `data-testid` handles.
- `api/` is the scores API on `node:http` and `node:sqlite`. Node runs its TypeScript directly, with no build step.
- `.nexus/` holds the Nexus configuration: `setup`, `services.yaml`, and `check`.
- `.claude/skills/verify-pylon-panic/` is the verification skill and its feature map.

## Commands

```sh
npm ci
npm run typecheck
npm test
npm run build
.nexus/check                      # all three; exit 1 on failure, 75 on a transient failure
npm run verify -- run core-loop   # drive the game and capture evidence
```

On a pylon, Nexus runs the API on port 8787 and the web app on its preview URL. The web app reaches the API only through Vite's `/api` proxy (`API_URL`, default `http://127.0.0.1:8787`), so the browser makes same-origin requests and the API needs no public URL and no CORS.

## Rules

- **Keep the simulation deterministic.** For a given seed and input sequence, `step` must produce the same state on every run. Inside `web/src/sim/`, never use `Math.random`, `Date`, `performance.now`, or the DOM. Draw random numbers from the state's seeded RNG, advance time only by fixed ticks, and keep state as plain data. The page accepts `?seed=`, and a test fails if two runs with the same seed and inputs diverge.
- **Every feature comes with tests.** Simulation behavior gets Vitest tests in `web/src/sim/`, and API behavior gets `node:test` tests in `api/src/`. Test what a player or API caller can observe.
- **Every feature updates the verify skill's feature map.** Add or update a file in `.claude/skills/verify-pylon-panic/features/`, list it in that folder's `README.md`, and add a journey in `scripts/journeys/` when the feature has a new player path.
- **Every PR has evidence.** The PR body has an `## Evidence` section with at least one GIF of the feature in play, plus screenshots, made by the verify skill and published as described below.
- `.nexus/check` passes before you push.

## PR evidence

The GitHub API cannot attach files to a PR, so evidence lives on the orphan branch `media`:

1. Run the journey for your feature, for example `npm run verify -- run core-loop`. Evidence goes to `.verify/runs/<journey>-seed<seed>/`.
2. Run `.claude/skills/verify-pylon-panic/scripts/publish-media.sh <your-pr-branch> .verify/runs/<run-folder>`. It commits the files to `media` under `<your-pr-branch>/<run-folder>/`, pushes, and prints Markdown with `https://github.com/ramtinJ95/nexus-demo/raw/<media-sha>/<path>` URLs.
3. Paste the GIF and screenshots into `## Evidence` as images. Link the MP4, because GitHub does not play a video from a repository URL inline.

Never commit evidence to your PR branch, and never force-push `media`. The verify skill's `SKILL.md` has the details.

## Pull requests

A PR body has these sections: `## Why`, `## What changed`, `## Evidence`, and `## How it was verified`. Keep each one short. One feature per PR, branched from `main`.

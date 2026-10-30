---
name: verify-pylon-panic
description: Drive Pylon Panic (the browser game in web/ and the scores API in api/) through real keyboard and mouse input with Playwright, and capture screenshots, a GIF, and an MP4 as evidence. Use it to prove a feature works before a PR, to make the PR's Evidence section, or to check that the game still plays after a change.
---

# Verify Pylon Panic

This skill starts a private copy of the game and API from an empty database, drives one journey in headless Chromium the way a player does, and writes evidence to `.verify/runs/<name>/`. Every PR in this repo needs that evidence, published by the media convention below.

All commands run from the repo root. The script is TypeScript that Node 26 runs directly.

```sh
npm run verify -- run core-loop            # up, doctor, capture, down
npm run verify -- run core-loop --seed 7   # another seed
npm run verify -- list                     # the journeys
```

## Launch

`npm run verify -- up` starts two processes that this run owns:

- the API on a free port, with `PYLON_DB` in `.verify/data/`, which `up` empties first;
- the Vite dev server for `web/` on a free port, with `API_URL` pointing at that API, so `/api` on the web origin reaches it.

`up` returns once the API health check passes, the page serves `Pylon Panic`, and `/api/health` answers through the web proxy. It records the URLs and process IDs in `.verify/stack.json`, and logs go to `.verify/api.log` and `.verify/web.log`.

This stack is separate from the Nexus services in `.nexus/services.yaml` (API on 8787, web on the preview port). Never drive the Nexus preview for evidence, because its database keeps scores between runs.

## Doctor

`npm run verify -- doctor` is read-only. It fails with a list of reasons unless:

- both recorded processes are alive;
- the web URL serves the game and `/api/health` answers 200 through the proxy;
- Chromium launches;
- `ffmpeg` and `ffprobe` are on `PATH`.

Run it first whenever something looks off. If Chromium or ffmpeg is missing, rerun `.nexus/setup`.

## Drive

A journey is one file in `scripts/journeys/` that exports a `Journey` (see `scripts/journey.ts`), registered by name in `scripts/journeys/index.ts`. The harness gives it:

- `page`, a Playwright page recording video, at 1280x720 with a mouse unless the journey sets `device: { width, height, touch: true }`;
- `open(path, options)`, which loads the web app with `?seed=` set, waits for the title screen, presses Enter, and waits for `data-screen="playing"`. Pass `{ title: true }` to stop on the title screen;
- `shot(name)`, `save(name, data)`, and `check(ok, claim)` for evidence and assertions;
- `clip.start()` and `clip.stop()`, which mark the stretch that becomes the GIF;
- `allowConsoleError(pattern)`, which stops one console error from failing the run. Call it only after the journey causes that error on purpose, as `leaderboard` does when it stops the API.

Drive the game only through real input. On a touch device, put fingers down with `touchscreen(page)` from `scripts/touch.ts`, as `journeys/touch-controls.ts` does. Use `page.keyboard.down("KeyW")` and `page.keyboard.up("KeyW")` to move, `page.mouse.move(x, y)` to aim, and `page.mouse.down()` and `page.mouse.up()` to fire. Map arena coordinates (1280x720) to the page through the arena canvas's bounding box, `[data-testid="game"] > canvas`, as `journeys/core-loop.ts` does. A bare `canvas` locator also matches the title logo. Never call game internals, never set state from the page, and never add a test-only endpoint to reach a state. If a state is slow to reach by playing, choose a seed that reaches it sooner.

Read the game through these stable handles:

| Handle | What it shows |
| --- | --- |
| `[data-testid="game"]` with `data-phase` | `playing` or `gameOver` |
| `[data-testid="hud-score"]` | score, which is kills plus waves survived |
| `[data-testid="hud-wave"]` | current wave |
| `[data-testid="hud-integrity"]` | pylon integrity |
| `[data-testid="hud-seed"]` | the seed of this run |
| `[data-testid="game-over"]` | the game over panel |
| `[data-testid="restart"]` | restart button. `R` also restarts |
| `[data-testid="leaderboard"]` with `data-state` | `hidden`, `naming`, `submitting`, `offline`, or `board` |
| `[data-testid="leaderboard-name"]` and `[data-testid="leaderboard-submit"]` | the name field and its submit button |
| `[data-testid="leaderboard-notice"]` | the offline notice, or the API's message for a rejected name |
| `[data-testid="leaderboard-row"]` with `data-mine` | one board row. `data-mine="true"` marks the player's |
| `[data-testid="game"]` with `data-reduced-motion` | `true` when reduced motion is on |
| `[data-testid="game"]` with `data-shake` | `true` while the screen shakes |
| `[data-testid="game"]` with `data-screen` | `title`, `playing` or `paused`. It keeps the menu's value while settings are open |
| `[data-testid="game"]` with `data-settings` | `true` while the settings panel is open |
| `[data-testid="game"]` with `data-palette` | `neon` or `colorblind` |
| `[data-testid="game"]` with `data-volume` | sound volume as a whole percent |
| `[data-testid="title-screen"]` | the title screen, with `title-logo` (the logo canvas) and `how-to-play` |
| `[data-testid="start"]` | starts the run. Enter also starts it from the title screen |
| `[data-testid="title-settings"]`, `[data-testid="pause-settings"]` | open the settings panel from the title screen or the pause overlay |
| `[data-testid="pause-overlay"]` | the pause overlay. Escape opens and closes it during a run |
| `[data-testid="resume"]` | resumes a paused run |
| `[data-testid="settings"]` | the settings panel. `settings-back` or Escape closes it |
| `[data-testid="setting-volume"]`, `[data-testid="setting-volume-value"]` | volume range, 0 to 100 in steps of 5, and its `60%` style readout |
| `[data-testid="setting-reduced-motion"]`, `[data-testid="setting-colorblind"]` | reduced motion and colorblind-safe colors checkboxes |
| `[data-testid="game"]` with `data-enemy-kinds` | the enemy kinds on the field now, sorted and space-separated |
| `[data-testid="hud-new-enemy"]` with `data-kind` | the banner for a kind that debuts this wave |
| `[data-testid="hud-boss"]` with `data-phase`, `data-move`, `data-hp`, `data-x`, `data-y` | the boss health bar, shown while a boss lives. Phase `1` or `2`, the charge state (`stalk`, `windup`, `lunge`), health, and position in arena coordinates |
| `[data-testid="hud-boss-phase"]`, `[data-testid="hud-boss-bar"]` | the boss phase label and the bar, whose width is the share of boss health left |
| `[data-testid="start-daily"]` | starts today's daily challenge. Its label is `Daily` and the UTC date |
| `[data-testid="game"]` with `data-mode` | `classic` or `daily` |
| `[data-testid="hud-mode"]` | `DAILY` and the date in a daily run. Hidden in classic |
| `[data-testid="leaderboard"]` with `data-board` | `classic` or `daily`, the board the run goes to |
| `[data-testid="leaderboard-title"]` | the board's title, `Top 10` or `Daily 2026-10-30`. Shown with the board |
| `[data-testid="game"]` with `data-touch` | `true` when the virtual sticks are shown |
| `[data-testid="touch-stick-move"]` and `[data-testid="touch-stick-aim"]` with `data-active` | the two virtual sticks. `true` while a thumb holds it |

A new feature adds its own `data-testid` handles, adds a row here, and adds a feature file under `features/`.

## Evidence

`capture` and `run` write one folder per run, `.verify/runs/<journey>-seed<seed>/` by default. `--name` replaces the folder name and accepts letters, digits, `.`, `_`, and `-`, with no `..`.

- `NN-*.png` screenshots, which the journey names;
- `<journey>.gif`, cut from the `clip` window, at most 8 seconds and 5 MB (the harness lowers frame rate and width until it fits);
- `<journey>.mp4`, the full recording as H.264, and `<journey>.webm`, the raw Playwright recording;
- `*.json` side effects the journey saved, such as API responses;
- `manifest.json` with the seed, URL, every check and whether it passed, page errors, and the file list.

Proof standards:

- Exercise the path a player uses. Capture the action and the resulting state, for example the firefight and then the score, not only the final screen.
- Check side effects as well as pixels. A feature that writes scores reads them back through `GET /api/scores`.
- A page error or console error fails the run.
- Use a fixed seed. The default is `1337`. The simulation is deterministic for a seed and an input sequence, but Playwright input timing varies by a few frames, so two captures look alike without being identical.
- A failed run still writes its video and manifest. Report it as failed. Never weaken a check so a journey passes. Record the reason in that feature's `Gotchas` instead.

## Publish to the PR

The GitHub API cannot attach files to a PR, so evidence goes on the orphan branch `media` under `<pr-branch>/`, and the PR body embeds it by the media commit's SHA:

```sh
.claude/skills/verify-pylon-panic/scripts/publish-media.sh <pr-branch> .verify/runs/core-loop-seed1337
```

The script commits the run folder's images, videos, and JSON to `media` at `<pr-branch>/<run-folder>/`, pushes, and prints Markdown lines with `https://github.com/ramtinJ95/nexus-demo/raw/<sha>/<path>` URLs. Paste them into the PR's `## Evidence` section:

- embed the GIF and the key screenshots as images (`![...](...)`);
- link the MP4 as a plain link, because GitHub does not play a video from a repository URL inline;
- name the journey, the seed, and the checks that passed, from `manifest.json`.

Never commit evidence to the PR branch, and never force-push `media`. Each thread writes only its own `<pr-branch>/` folder, so the script's rebase-and-retry cannot conflict. Republishing after a fix makes a new SHA. Update the PR body to the new links.

## Cleanup

`npm run verify -- down` stops the two process groups recorded in `.verify/stack.json` and deletes `.verify/data/`. It kills only what `up` started, never by process name. `run` calls `down` even when the journey fails. Evidence in `.verify/runs/` stays until you delete it, and `.verify/` is gitignored.

## Features

`features/README.md` is the map of what to verify and how. Every feature PR updates it. Add a feature file, add a journey when the feature has a new player path, and list both in the index.

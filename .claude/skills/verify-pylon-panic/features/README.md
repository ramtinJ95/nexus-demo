# Pylon Panic verification map

This directory lists the player-facing features of Pylon Panic and how to prove each one. Read this index before you drive the game, then use the matching feature file as the recipe.

## Baseline preconditions

- `.nexus/setup` has run, so Debian `chromium`, `ffmpeg`, and `node_modules` exist.
- The stack comes from `npm run verify -- up`, with an empty database. Never drive the Nexus preview.
- `npm run verify -- doctor` passes.
- Journeys load the game with `?seed=1337` unless the feature file names another seed.

## Driving conventions

- Drive through real keyboard and mouse input only. Never call game code or set state from the page.
- Read state from `data-testid` handles. The table in `../SKILL.md` lists them.
- Map arena coordinates (1280x720) to the page through the canvas bounding box.
- Reach API state through the web origin's `/api` proxy, as the game does.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- Every journey writes `manifest.json` with its checks. Quote the passed checks in the PR.
- Every PR shows at least one GIF of its feature in play.
- Report a path you could not reach with the command you ran and the precondition that was missing. Never report it as verified through another path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on what the player sees. Then come exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, and `Gotchas`. Keep implementation details out. Name player paths, handles, required state, commands, and observable proof.

## Features

| Feature | Journey | Covers |
| --- | --- | --- |
| [Core loop](./core-loop.md) | `core-loop` | moving, aiming, shooting, waves, HUD, pylon drain, game over, restart |
| [Enemy variety](./enemy-variety.md) | `enemy-dasher`, `enemy-splitter`, `enemy-shielded` | wave debuts, dasher lunge, splitter split, shielded bug hit from behind, mixed waves |
| [Game feel](./game-feel.md) | `game-feel` | hit sparks, death bursts, hit flash, muzzle flash, screen shake and pylon glow pulse on damage, reduced motion |
| [Title and settings](./title-settings.md) | `title-settings` | title screen and logo, how to play, settings panel (volume, reduced motion, colorblind palette) kept across reloads, pause and resume on Escape |
| [Leaderboard](./leaderboard.md) | `leaderboard` | name entry on game over, submitting, the top 10 with the player's row highlighted, the API-down notice |
| [Leaderboard API](./leaderboard-api.md) | `leaderboard-api` | health, listing, submitting, and validating scores |

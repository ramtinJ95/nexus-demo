# Core loop

The player flies a drone around a glowing pylon at the arena's center. Bugs crawl in from the edges in waves that grow. Shooting a bug kills it. A bug that reaches the pylon latches on and drains integrity until it is shot. The HUD shows score, wave, integrity, and seed. At integrity 0 the game over panel shows the final score and wave, and the player can restart with the same seed.

## Sub-features

- `core-move` moves the drone with W, A, S, and D, and keeps it inside the arena.
- `core-aim-fire` aims at the mouse and fires while the mouse button is held.
- `core-kill` removes a bug that a bullet hits, and adds 1 to the score.
- `core-waves` starts wave 1 at once and each later wave with more bugs, and adds 1 to the score for each cleared wave.
- `core-drain` drains integrity while bugs are latched onto the pylon.
- `core-game-over` ends the run at integrity 0 and shows the game over panel.
- `core-restart` starts a fresh run with the same seed from R or the restart button.

## How to get to it (user POV)

- Open the web app at `/?seed=<seed>`. The run starts at once. Without `?seed=`, the page picks a seed and writes it into the URL.
- Press R or choose the restart button on the game over panel.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337`.

Run `npm run verify -- run core-loop`. The journey does the following.

- **Start.** Open the page. `[data-testid="game"]` has `data-phase="playing"`, `hud-wave` reads 1, and `hud-score` reads 0. Screenshot `01-start`.
- **Fight.** Hold the mouse button, sweep the aim in a circle 260 arena units around the pylon, and tap W, D, S, and A in turn for 8 seconds. This stretch is the GIF. Screenshot `02-firefight`. `hud-score` is above 0.
- **Lose.** Release all input. Bugs latch onto the pylon until `data-phase` becomes `gameOver`. `hud-integrity` reads 0 and `[data-testid="game-over"]` is visible. Screenshot `03-game-over`.
- **Restart.** Press R. `data-phase` is `playing`, `hud-score` reads 0, and `hud-wave` reads 1. Screenshot `04-restarted`.

## Gotchas

- Playwright input timing varies by a few frames, so the score after the fight differs a little between captures with the same seed. Assert that the score rose, not an exact value.
- The game reads the mouse only over the canvas. Move the mouse inside the canvas bounding box before `mouse.down()`.
- After the fight, the bugs that are left need up to about 50 seconds to drain the pylon, because one latched crawler drains 2 integrity per second. The journey waits up to 120 seconds. The GIF covers only the fight.

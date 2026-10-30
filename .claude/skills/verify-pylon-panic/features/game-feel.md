# Game feel

Hits and deaths react on screen. A bullet that hits a bug throws sparks in the bug's color and flashes the bug white. A killed bug bursts into particles. The drone's gun flashes at the muzzle on every shot. When a bug latches onto the pylon, the screen shakes and the pylon's glow pulses. A player who prefers reduced motion gets no shake and no flashes, and keeps the particles and the pylon pulse.

## Sub-features

- `fx-hit-particles` throws sparks where a bullet hits a bug.
- `fx-death-particles` bursts a killed bug into particles.
- `fx-hit-flash` flashes a bug white for a moment when a bullet hits it.
- `fx-muzzle-flash` flashes the drone's muzzle on every shot.
- `fx-shake` shakes the screen when a bug latches onto the pylon. `[data-testid="game"]` has `data-shake="true"` while it shakes.
- `fx-pylon-pulse` pulses the pylon's glow and sends out a ring when a bug latches onto it.
- `fx-reduced-motion` turns shake, the hit flash and the muzzle flash off. It is on when the OS or browser prefers reduced motion, or when the URL has `?reducedMotion=1`. `[data-testid="game"]` has `data-reduced-motion="true"` when it is on.

## How to get to it (user POV)

- Open the web app and shoot at bugs while holding the mouse button. Let a bug reach the pylon.
- For reduced motion, turn on the OS reduced-motion setting, or open `/?seed=<seed>&reducedMotion=1`.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337`.

Run `npm run verify -- run game-feel`. The journey does the following.

- **Full motion.** Open the page. `data-reduced-motion` is `false`. Hold the mouse button and sweep the aim in a circle 200 arena units around the pylon for 7 seconds. Screenshot `01-firefight-particles-flashes`. `hud-score` is above 0. This stretch is the GIF.
- **Pylon hit.** At the first `data-shake="true"`, during the fight or after it, screenshot `02-pylon-hit-shake-pulse`. `hud-integrity` is below 100.
- **Reduced motion.** Emulate `prefers-reduced-motion: reduce` and reload. `data-reduced-motion` is `true`. Fight for 7 seconds. Screenshot `03-reduced-motion-firefight`. At the first drop of `hud-integrity` below 100, screenshot `04-reduced-motion-pylon-hit`. `data-shake` never became `true`.

For a before-and-after comparison, run `core-loop` with the same seed on `main` and on the branch, and put the two GIFs side by side with `ffmpeg -i before.gif -i after.gif -filter_complex hstack`.

## Gotchas

- With seed 1337, bugs latch onto the pylon during the fight, and no new bug latches after it before the run ends. Take the pylon-hit screenshot at the first shake, not after the fight.
- Effects last a fraction of a second, so a screenshot can miss a flash, and the reduced-motion pylon-hit shot lands after the pulse has faded. Read `data-shake` for the shake instead of judging it from pixels.
- The journey watches `data-shake` with a `MutationObserver` that it adds after each page load, so a shake before that point is not recorded.
- Playwright input timing varies by a few frames, so particles and flashes land in a slightly different place between captures with the same seed.

# Touch controls

On a phone, two virtual sticks sit at the bottom of the screen. The left thumb moves the drone, and the right thumb aims it. The drone fires on its own while the right thumb is down. A stick centers where the thumb lands, so either half of the screen works as a stick. In portrait the arena sits under the HUD, which leaves the space below it for the thumbs. In landscape the arena fills the height and the sticks sit over its lower corners. A desktop with a mouse sees no sticks and plays as before.

## Sub-features

- `touch-sticks` shows both sticks at rest on a device with a coarse pointer, or after the first touch. `[data-testid="game"]` has `data-touch="true"` then. The sticks hide on the game over panel.
- `touch-move` maps a touch that starts on the left half of the screen to the move stick. Speed scales with how far the knob is pushed, after a small dead zone. `[data-testid="touch-stick-move"]` has `data-active="true"` while that thumb is down.
- `touch-aim-fire` maps a touch that starts on the right half to the aim stick. The drone faces the knob's direction and fires while the thumb is down. It keeps its heading when the thumb lifts. `[data-testid="touch-stick-aim"]` has `data-active="true"` while that thumb is down.
- `touch-layout` fits the HUD, the arena, and the game over panel at phone sizes, 390x844 in portrait and 844x390 in landscape. The game over panel scrolls when it is taller than the screen.

## How to get to it (user POV)

- Open the web app on a phone or tablet, in either orientation. Put the left thumb down and drag to move. Put the right thumb down and drag to aim and fire. Lift the right thumb to stop firing.
- On the game over panel, tap Restart.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The journey's device has touch. A journey sets `device: { width, height, touch: true }`, and the harness turns on `hasTouch` and `isMobile` for it.
- Fingers go through `scripts/touch.ts`, which sends Chromium touch events over CDP, so the page gets `pointerType: "touch"` events. `page.touchscreen.tap` is enough for a tap.

Run `npm run verify -- run touch-portrait` for 390x844 and `npm run verify -- run touch-landscape` for 844x390. Each journey does the following.

- **Rest.** `data-touch` is `true`, both sticks are visible, the HUD does not overflow its width, and the arena fits the screen. In portrait the arena is below the HUD. Screenshot `01-<orientation>-start`.
- **Play.** Put one finger on each stick's rest position. Both sticks have `data-active="true"`. Walk the move stick through four directions and sweep the aim stick in a circle for about 5.5 seconds. Screenshot `02-<orientation>-firefight` midway. `hud-score` is above 0. This stretch, through the lift below, is the GIF.
- **Lift.** Lift the aim finger. The aim stick has `data-active="false"`, and `hud-score` does not change over the next 1.5 seconds.
- **Game over.** Wait for `data-phase="gameOver"`. The sticks are hidden and `restart` is visible. Screenshot `03-<orientation>-game-over`. Tap `restart`, and `hud-score` is 0.

Run `core-loop` too, to show that mouse and keyboard play is unchanged.

## Gotchas

- To lift one finger and keep the other down, send a CDP `touchEnd` that lists only the lifted finger. A `touchMove` without it does not release it.
- With seed 1337 the circling aim sweep kills only a few bugs, so the score stays small. The check is that it rises, which shows auto-fire.
- The journey does not submit a score, so the 10-row board on a short landscape screen, which scrolls, is not in the evidence.
- The headless run emulates touch in desktop Chromium. It does not show iOS Safari's bars, safe areas, or pinch zoom.

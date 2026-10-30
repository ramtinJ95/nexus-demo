# Enemy variety

Three new bug kinds join the crawler, one per wave. Wave 2 brings the dasher, a slim amber bug that stops, winds up, and lunges at the drone. A lunge that connects shoves the drone away. Wave 3 brings the splitter, a fat violet two-lobed bug that breaks into two fast splitlings when it dies. Wave 4 brings the shielded bug, which carries a bright shield on its front. Shots that hit the shield spark off, so the player must fly around it and shoot it from behind. A banner names each new kind and how to beat it during its first wave.

## Sub-features

- `enemy-debut` keeps wave 1 crawler-only, adds one new kind in each of waves 2, 3, and 4, and opens each of those waves with the new kind. `hud-new-enemy` names it.
- `enemy-dasher` stalks the pylon, stops and blinks while it winds up near the drone, then lunges in a straight line. A lunge that touches the drone shoves it.
- `enemy-splitter` breaks into two splitlings at the spot where it dies. Each splitling counts as its own kill.
- `enemy-shielded` blocks every bullet that hits its front and takes damage only from bullets that hit it from behind.
- `enemy-mixed` puts crawlers, dashers, splitters, and shielded bugs on the field together from wave 4 on.

## How to get to it (user POV)

- Open the web app at `/?seed=<seed>` and survive. Dashers arrive in wave 2, about 15 seconds in. Splitters arrive in wave 3, about 35 seconds in. Shielded bugs arrive in wave 4, about 60 seconds in.
- `[data-testid="hud-new-enemy"]` shows during each debut wave, with `data-kind` set to the new kind.
- `[data-testid="game"]` carries `data-enemy-kinds`, the kinds on the field now, sorted and space-separated.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337`.

Each journey plays blind the way a turret player does. It holds the mouse button with the aim on the pylon and patrols the arena's edge with S, D, W, and A, holding each key past the wall. From the edge, every shot at the pylon hits the bugs in between from behind. It plays until the debut wave, checks the banner and `data-enemy-kinds`, records the GIF while the new kind is on the field, and then plays until the wave clears.

- `npm run verify -- run enemy-dasher` plays to wave 2. Screenshots `01-dasher-arrives`, `02-dasher-attacks`, and `04-wave-2-cleared`.
- `npm run verify -- run enemy-splitter` plays to wave 3 and waits for `splitling` in `data-enemy-kinds`. Screenshots `01-splitter-arrives`, `02-splitter-splits`, and `04-wave-3-cleared`.
- `npm run verify -- run enemy-shielded` plays to wave 4 and waits for all four kinds in `data-enemy-kinds`. Screenshots `01-shielded-arrives`, `02-shielded-edge-patrol`, `03-mixed-wave`, and `04-wave-4-cleared`. A cleared wave 4 proves the drone killed every shielded bug, which only shots from behind can do.

## Gotchas

- The journeys cannot see the drone. An orbit around the pylon drifted with dasher shoves and input timing, and the pylon fell in wave 2, 3, or 4 depending on the run. The edge patrol cannot drift, because the walls re-anchor the drone every lap.
- A shot that a shield blocks bursts into pale blue sparks, and the bug does not flash. That is the only sign of a block, because no HUD handle counts blocks. With `?reducedMotion=1` the sparks stay, because they are particles.
- The enemy-shielded journey plays for about 90 seconds before the GIF starts, because it must clear waves 1 to 3 first.
- A splitter that dies while latched drops its splitlings onto the pylon, where they latch at once.

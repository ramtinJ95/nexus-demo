# Boss bug

Every fifth wave ends with a boss. Once the wave's last regular bug dies, a huge red horned beetle crawls in from the edge and a health bar labelled `BOSS PHASE 1` appears at the top of the arena. The boss stalks the pylon, stops, and paints a blinking lane toward the drone before it charges down that lane. The lane is fixed when the telegraph starts, so stepping out of it dodges the charge. A charge that hits the drone shoves it, and a boss that reaches the pylon latches on and drains it fast. At half health the boss enrages into phase 2. The bar reads `PHASE 2 · ENRAGED`, the boss bursts out a brood of splitlings every few seconds, and it telegraphs and charges faster. The wave clears when the boss and its brood are dead.

## Sub-features

- `boss-arrival` keeps waves 1 to 4 boss-free and spawns one boss at the end of waves 5, 10, and so on, after the wave's regular bugs are gone.
- `boss-health-bar` shows `hud-boss` with the boss's health while it lives, and hides it when it dies.
- `boss-telegraph` stops the boss and draws its charge lane before every charge. The charge runs down that lane even if the drone moves.
- `boss-phase-1` charges at the drone at a slower pace.
- `boss-phase-2` starts at half health, spawns splitling broods, and charges with a shorter telegraph.
- `boss-clear` clears the wave once the boss and its brood are dead.

## How to get to it (user POV)

- Open the web app at `/?seed=<seed>` and survive four waves. Wave 5 starts about 90 seconds in, and its boss arrives when its regular bugs are cleared, about two minutes in.
- `[data-testid="hud-boss"]` shows while a boss lives. It carries `data-phase` (`1` or `2`), `data-move` (`stalk`, `windup` while it telegraphs, or `lunge` while it charges), `data-hp`, and `data-x` and `data-y`, the boss's position in arena coordinates. `[data-testid="hud-boss-phase"]` names the phase, and `[data-testid="hud-boss-bar"]` is the bar, its width the share of health left.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337`.

Run `npm run verify -- run boss`. The journey plays waves 1 to 5 like the enemy-variety journeys, holding fire at the pylon and patrolling the arena's edge. When `hud-boss` shows, it keeps patrolling but aims at `data-x` and `data-y`, the way a player watches the boss. The fight, from the boss's arrival to its death, is the GIF.

- Screenshot `01-boss-health-bar` as the boss arrives, in phase 1 with a full bar.
- Screenshot `02-boss-telegraph-phase-1` the first time `data-move` reads `windup`.
- Screenshot `03-boss-phase-2` when `data-phase` turns `2`.
- Screenshot `04-boss-telegraph-phase-2` at the first phase 2 windup.
- Screenshot `05-wave-5-cleared` after `hud-wave` passes 5.
- `boss-fight.json` saves the fight's length in milliseconds and when phase 2 began.

## Gotchas

- The blind patrol does not always survive wave 5. With seed 7 the pylon fell to wave 5's regular bugs before the boss arrived, so the run fails on `the drone holds the pylon through wave 5's regular bugs`. With seed 1337 it reaches the boss and wins. Pick another seed if a run dies before the boss, and never report that run as a boss check.
- The journey plays about two minutes before the boss arrives, because it must clear waves 1 to 5 first.
- The GIF is capped at 8 seconds. A fight longer than that is cut, so the MP4 is the full record. `boss-fight.json` says how long the fight took.
- The journey reads the boss's position from `hud-boss` instead of the canvas. That is what the player's eyes give them. It never sets state.
- Brood splitlings soak up shots aimed at the boss, so phase 2 takes longer than phase 1 at the same health.

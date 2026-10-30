# Title and settings

The game opens on a title screen with a glowing neon logo, a short how-to-play list, and Start and Settings buttons. The run waits, frozen, until the player presses Enter or Start. The settings panel sets the sound volume, turns reduced motion on, and switches to a colorblind-safe palette, and the game keeps these choices across reloads. During a run, Escape pauses the game under a pause overlay and Escape again resumes it.

## Sub-features

- `title-screen` shows the logo, the how-to-play list, and the Start and Settings buttons. The arena stays frozen behind it.
- `title-start` starts the run from Enter or the Start button.
- `settings-volume` sets the volume of the sound effects from 0% to 100% in steps of 5. The default is 60%.
- `settings-reduced-motion` turns reduced motion on or off. The default follows the OS preference. `?reducedMotion=1` forces it on and disables the checkbox.
- `settings-colorblind` switches the arena and HUD to the Okabe-Ito colorblind-safe palette.
- `settings-persist` keeps all three settings in the browser across reloads.
- `pause` pauses a run on Escape, freezing the sim, the HUD, and the effects. Escape or Resume continues the run. Escape does nothing once the run is over.
- `pause-settings` opens the settings panel from the pause overlay. Escape closes the panel first and leaves the game paused.

## How to get to it (user POV)

- Open the web app at `/?seed=<seed>`. The title screen shows. Press Enter or choose Start to play.
- Choose Settings on the title screen or the pause overlay. Drag the volume slider or press the arrow keys on it, and click the checkboxes. Choose Back or press Escape to close the panel.
- Press Escape during a run to pause. Press Escape or choose Resume to continue.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337` in a fresh browser context, so nothing is stored yet.

Run `npm run verify -- run title-settings`. The journey does the following.

- **Title.** Open the page with `open("/", { title: true })`. `title-screen` and `how-to-play` are visible, `data-screen` is `title`, and at least 2% of the `title-logo` canvas's pixels are lit. After 2 seconds, `hud-score`, `hud-integrity`, `hud-countdown`, and `hud-wave` have not changed. Screenshot `01-title`.
- **Settings.** Click `title-settings`. `settings` is visible, `data-settings` is `true`, `data-volume` is `60`, `data-palette` is `neon`, and `data-reduced-motion` is `false`. Screenshot `02-settings`. Press ArrowLeft twice on `setting-volume`, then click `setting-colorblind` and `setting-reduced-motion`. `data-volume` is `50` and `setting-volume-value` reads `50%`, `data-palette` is `colorblind`, and `data-reduced-motion` is `true`.
- **Persist.** Reload with `open("/", { title: true })` and click `title-settings`. The slider reads 50, both checkboxes are checked, and the root attributes match. Screenshot `03-settings-persisted`.
- **Play.** Press Escape to close settings, then Enter. `data-screen` is `playing`. Fight until `hud-score` is above 0. This is where the GIF starts. Fight 1 more second. Screenshot `04-colorblind-play`.
- **Pause.** Press Escape. `data-screen` is `paused` and `pause-overlay` is visible. After 1.5 seconds, score, integrity, countdown, and wave have not changed. Screenshot `05-paused`.
- **Resume.** Press Escape. `data-screen` is `playing` and `pause-overlay` is hidden. Fight until `hud-score` rises above its paused value, for at most 10 seconds, alternating a sweep 70 arena units around the pylon with the 200-unit one. The GIF ends here.

## Gotchas

- A bare `canvas` locator matches both the arena and the title logo, and Playwright's strict mode rejects it. Locate the arena with `[data-testid="game"] > canvas`.
- `open()` presses Enter on the title screen by default, so other journeys start in play. Pass `{ title: true }` to stay on the title screen.
- Each capture uses a fresh browser context, so stored settings never leak between runs. A reload inside one journey keeps them.
- Under Playwright's video recording each 50 ms aim step takes about 100 ms, and the first kill with seed 1337 lands about 7 seconds into play. The journey fights until the first kill before it starts the GIF, so the clip shows play, pause, and resume inside 8 seconds.
- By the time of the pause, the bugs that are left are often latched on the far side of the pylon from the drone, where the 200-unit sweep never aims. The resume fight adds a 70-unit sweep to reach them. Each sweep pass is a full turn, because every `fight` call restarts at angle 0.
- Volume has no audible check. `data-volume` and the slider are the proof that the setting applies and persists.

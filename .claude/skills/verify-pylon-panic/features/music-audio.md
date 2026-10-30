# Music and audio

A synthesized music loop plays during a run and grows busier and faster as the waves rise: a kick and bass line first, then hi-hats from wave 2, an arpeggio from wave 4, and a lead melody from wave 7. The music stops on the title screen, the pause overlay, and game over, and starts again from wave 1 after a restart. Sound effects mark wave starts, the debut of a new enemy kind, cleared waves, shield blocks, and drone hits, and game over plays a short descending sting. The settings panel has separate Music and Effects volumes. Nothing sounds until the player's first key press, click, or tap.

## Sub-features

- `audio-unlock` keeps the game silent until the first key press or pointer press. `[data-testid="game"]` has `data-audio="locked"` until then, `running` once the browser plays sound, and `unavailable` when the browser has no Web Audio.
- `music-levels` plays music level 1 in wave 1, level 2 from wave 2, level 3 from wave 4, and level 4 from wave 7. Each level adds a voice and raises the tempo. `data-music` is the level, from `1`, while a run is in play, and `off` otherwise. The level rises the moment a wave is cleared, so the rest before the next wave already plays the next level.
- `music-stops` turns the music off on the title screen, the pause overlay, the settings panel, and game over.
- `sfx-events` plays a chime when a wave starts, an alert instead of the chime on a wave that debuts an enemy kind (the same waves that show `hud-new-enemy`), a rising arpeggio when a wave is cleared, a ping on a shield block, and a thud on a drone hit, on top of the shot, kill, and pylon-hit sounds.
- `sfx-game-over` plays four falling notes on game over.
- `settings-music-effects` sets the music and effects volumes apart, 0% to 100% in steps of 5. The defaults are 50% for music and 60% for effects. Both persist across reloads. A volume saved before the split seeds both.

## How to get to it (user POV)

- Open the web app at `/?seed=<seed>`, press Enter or Start, and play. Clear wave 1 to hear the music gain hi-hats and speed up.
- Press Escape to pause and hear the music stop. Press Escape again to resume it.
- Choose Settings on the title screen or the pause overlay and move the Music or Effects slider.

## Driving it with Playwright

Preconditions:

- `npm run verify -- doctor` passes.
- The page is open at `/?seed=1337` in a fresh browser context, so nothing is stored yet.

Run `npm run verify -- run music-audio`. The journey does the following.

- **Locked.** Open the page with `open("/", { title: true })`. Before any input, `data-audio` is `locked` and `data-music` is `off`.
- **Settings.** Click `title-settings`. `setting-music-volume` and `setting-sfx-volume` are visible, `data-music-volume` is `50` with `setting-music-volume-value` reading `50%`, and `data-sfx-volume` is `60` with `setting-sfx-volume-value` reading `60%`. Screenshot `01-settings-music-effects`. Press ArrowRight twice on the music slider and ArrowLeft four times on the effects slider. `data-music-volume` is `60` and `data-sfx-volume` is `40`, and both readouts match.
- **Persist.** Reload with `open("/", { title: true })`. `data-audio` is `locked` again. Click `title-settings`. The sliders read 60 and 40 and the root attributes match. Screenshot `02-settings-persisted`. After the click, `data-audio` is `running`, and `data-music` is still `off`.
- **Wave 1.** Press Escape and Enter. `data-music` is `1`. Fight with full sweeps 200 and 70 arena units around the pylon. On every sweep step that `hud-wave` reads 1, `data-music` reads `1`. When `hud-score` reaches 5 the GIF starts.
- **Level 2.** At the first step where `data-music` is `2`, screenshot `03-wave-2-music-level-2`. `hud-wave` reads 2. Press Escape. `data-screen` is `paused` and `data-music` is `off`. Screenshot `04-paused-music-off`. Wait 0.6 seconds and press Escape. `data-music` is `2` again. Fight 1 more second. The GIF ends here.

## Gotchas

- The journey cannot hear the game. `data-audio` and `data-music` are the proof that the audio unlocked and that the music follows the wave and the pause. The sounds and the music's voices are covered by the Vitest tests in `web/src/audio.test.ts` and `web/src/music.test.ts`.
- Debian's headless Chromium allows the AudioContext to run after a Playwright click, because Playwright's input counts as a user gesture. If `data-audio` stays `locked` on another browser build, the autoplay policy blocked it. Record that here instead of dropping the check.
- `data-music` shows the level the game asks for, so it reads `1` in a run even on a browser where `data-audio` is `unavailable`.
- The last bugs of wave 1 often latch behind the pylon from the drone's spot, where only the 70-unit sweep reaches them. Each `fight` call restarts at angle 0, so a sweep must last 2.7 seconds to make a full turn.
- Under video recording each sweep takes about twice its nominal time. The GIF starts with one wave 1 bug left, and the pause and resume run inside the sweep step that sees level 2, so the clip stays near 5 seconds.

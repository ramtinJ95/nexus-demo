import { describe, expect, it } from "vitest";
import { musicLevel, musicLevels, notesAt, STEPS_PER_BAR, stepSeconds } from "./music";

const levelFor = (wave: number) => musicLevels[musicLevel(wave)]!;
const bar = (wave: number, from = 0) => Array.from({ length: STEPS_PER_BAR }, (_, i) => notesAt(levelFor(wave), from + i)).flat();

describe("music", () => {
  it("intensity never drops as the waves rise, and wave 8 is busier and faster than wave 1", () => {
    for (let wave = 1; wave < 20; wave++) {
      const now = levelFor(wave);
      const next = levelFor(wave + 1);
      expect(next.voices.length).toBeGreaterThanOrEqual(now.voices.length);
      expect(next.bpm).toBeGreaterThanOrEqual(now.bpm);
      expect(stepSeconds(next)).toBeLessThanOrEqual(stepSeconds(now));
    }
    expect(levelFor(8).voices.length).toBeGreaterThan(levelFor(1).voices.length);
    expect(levelFor(8).bpm).toBeGreaterThan(levelFor(1).bpm);
    expect(bar(8).length).toBeGreaterThan(bar(1).length);
  });

  it("the first wave plays the first level, and waves before any level do too", () => {
    expect(musicLevel(1)).toBe(0);
    expect(musicLevel(0)).toBe(0);
    expect(musicLevel(1000)).toBe(musicLevels.length - 1);
  });

  it("every voice a level lists plays in every bar of the loop", () => {
    for (const level of musicLevels) {
      for (let barIndex = 0; barIndex < 4; barIndex++) {
        const voices = new Set(bar(level.fromWave, barIndex * STEPS_PER_BAR).map((note) => note.voice));
        expect([...voices].sort()).toEqual([...level.voices].sort());
      }
    }
  });

  it("every note has a finite positive pitch, length and gain", () => {
    for (const level of musicLevels) {
      for (const note of bar(level.fromWave, 0).concat(bar(level.fromWave, 3 * STEPS_PER_BAR))) {
        for (const value of [note.freq, note.seconds, note.gain]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
        expect(note.freq).toBeLessThan(20000);
      }
    }
  });

  it("the bass line follows the chord changes from bar to bar", () => {
    const bassRoot = (barIndex: number) => notesAt(levelFor(1), barIndex * STEPS_PER_BAR).find((note) => note.voice === "bass")!.freq;
    expect(new Set([0, 1, 2, 3].map(bassRoot)).size).toBeGreaterThan(1);
    expect(bassRoot(4)).toBe(bassRoot(0));
  });
});

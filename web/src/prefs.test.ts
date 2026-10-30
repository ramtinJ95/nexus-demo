import { describe, expect, it } from "vitest";
import { loadPrefs, parsePrefs, savePrefs, type Prefs } from "./prefs";

const fallback: Prefs = { volume: 0.6, reducedMotion: false, palette: "neon" };

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

describe("prefs", () => {
  it("saved prefs load back", () => {
    const storage = memoryStorage();
    const prefs: Prefs = { volume: 0.25, reducedMotion: true, palette: "colorblind" };
    savePrefs(storage, prefs);
    expect(loadPrefs(storage, fallback)).toEqual(prefs);
  });

  it("nothing stored, or unreadable text, gives the fallback", () => {
    expect(loadPrefs(memoryStorage(), fallback)).toEqual(fallback);
    for (const raw of ["{", "null", "42", '"neon"', "[]"]) expect(parsePrefs(raw, fallback)).toEqual(fallback);
  });

  it("each bad field falls back on its own and keeps the good ones", () => {
    expect(parsePrefs('{"volume":"loud","reducedMotion":true,"palette":"sepia"}', fallback)).toEqual({ ...fallback, reducedMotion: true });
    expect(parsePrefs('{"palette":"colorblind","reducedMotion":1}', fallback)).toEqual({ ...fallback, palette: "colorblind" });
    expect(parsePrefs('{"palette":"toString"}', fallback)).toEqual(fallback);
  });

  it("clamps volume to 0..1", () => {
    expect(parsePrefs('{"volume":3}', fallback).volume).toBe(1);
    expect(parsePrefs('{"volume":-1}', fallback).volume).toBe(0);
    expect(parsePrefs('{"volume":0}', fallback).volume).toBe(0);
  });

  it("storage that throws loads the fallback and saving does not throw", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadPrefs(broken, fallback)).toEqual(fallback);
    expect(() => savePrefs(broken, fallback)).not.toThrow();
  });
});

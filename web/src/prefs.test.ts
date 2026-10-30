import { describe, expect, it } from "vitest";
import { loadPrefs, parsePrefs, savePrefs, type Prefs } from "./prefs";

const fallback: Prefs = { musicVolume: 0.5, sfxVolume: 0.6, reducedMotion: false, palette: "neon" };

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

describe("prefs", () => {
  it("saved prefs load back", () => {
    const storage = memoryStorage();
    const prefs: Prefs = { musicVolume: 0.1, sfxVolume: 0.25, reducedMotion: true, palette: "colorblind" };
    savePrefs(storage, prefs);
    expect(loadPrefs(storage, fallback)).toEqual(prefs);
  });

  it("nothing stored, or unreadable text, gives the fallback", () => {
    expect(loadPrefs(memoryStorage(), fallback)).toEqual(fallback);
    for (const raw of ["{", "null", "42", '"neon"', "[]"]) expect(parsePrefs(raw, fallback)).toEqual(fallback);
  });

  it("each bad field falls back on its own and keeps the good ones", () => {
    expect(parsePrefs('{"musicVolume":"loud","sfxVolume":null,"reducedMotion":true,"palette":"sepia"}', fallback)).toEqual({ ...fallback, reducedMotion: true });
    expect(parsePrefs('{"palette":"colorblind","reducedMotion":1}', fallback)).toEqual({ ...fallback, palette: "colorblind" });
    expect(parsePrefs('{"palette":"toString"}', fallback)).toEqual(fallback);
  });

  it("clamps each volume to 0..1 on its own", () => {
    expect(parsePrefs('{"musicVolume":3,"sfxVolume":-1}', fallback)).toMatchObject({ musicVolume: 1, sfxVolume: 0 });
    expect(parsePrefs('{"musicVolume":-2,"sfxVolume":7}', fallback)).toMatchObject({ musicVolume: 0, sfxVolume: 1 });
    expect(parsePrefs('{"musicVolume":0,"sfxVolume":0.35}', fallback)).toMatchObject({ musicVolume: 0, sfxVolume: 0.35 });
  });

  it("an old single volume seeds both volumes, and a stored new volume wins over it", () => {
    expect(parsePrefs('{"volume":0.3,"palette":"colorblind"}', fallback)).toEqual({ ...fallback, musicVolume: 0.3, sfxVolume: 0.3, palette: "colorblind" });
    expect(parsePrefs('{"volume":0.3,"sfxVolume":0.9}', fallback)).toMatchObject({ musicVolume: 0.3, sfxVolume: 0.9 });
    expect(parsePrefs('{"volume":4}', fallback)).toMatchObject({ musicVolume: 1, sfxVolume: 1 });
    expect(parsePrefs('{"volume":"loud"}', fallback)).toEqual(fallback);
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

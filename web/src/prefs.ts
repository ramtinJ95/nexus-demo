import { palettes, type PaletteName } from "./render/palette";

/** Volumes are 0 to 1. */
export type Prefs = { musicVolume: number; sfxVolume: number; reducedMotion: boolean; palette: PaletteName };

export const PREFS_KEY = "pylon-panic.prefs";

/** Parses untrusted storage text field by field, so one bad field keeps the others. */
export function parsePrefs(raw: string | null, fallback: Prefs): Prefs {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "null");
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) return fallback;
  const { volume, musicVolume, sfxVolume, reducedMotion, palette } = data as Record<string, unknown>;
  // Before music, one `volume` set the effects; it seeds both so a player's old setting carries over.
  const legacy = parseVolume(volume);
  return {
    musicVolume: parseVolume(musicVolume) ?? legacy ?? fallback.musicVolume,
    sfxVolume: parseVolume(sfxVolume) ?? legacy ?? fallback.sfxVolume,
    reducedMotion: typeof reducedMotion === "boolean" ? reducedMotion : fallback.reducedMotion,
    palette: typeof palette === "string" && Object.hasOwn(palettes, palette) ? (palette as PaletteName) : fallback.palette,
  };
}

function parseVolume(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

/** Storage throws in some private modes and sandboxes; then prefs last only for the page. */
export function loadPrefs(storage: Pick<Storage, "getItem">, fallback: Prefs): Prefs {
  try {
    return parsePrefs(storage.getItem(PREFS_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function savePrefs(storage: Pick<Storage, "setItem">, prefs: Prefs): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

import { palettes, type PaletteName } from "./render/palette";

export type Prefs = { /** 0 to 1. */ volume: number; reducedMotion: boolean; palette: PaletteName };

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
  const { volume, reducedMotion, palette } = data as Record<string, unknown>;
  return {
    volume: typeof volume === "number" && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : fallback.volume,
    reducedMotion: typeof reducedMotion === "boolean" ? reducedMotion : fallback.reducedMotion,
    palette: typeof palette === "string" && Object.hasOwn(palettes, palette) ? (palette as PaletteName) : fallback.palette,
  };
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

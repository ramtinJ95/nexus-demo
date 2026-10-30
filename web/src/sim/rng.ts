/** Mulberry32. The generator's whole state is `holder.rng`, so a GameState alone reproduces the run. */
export function nextRandom(holder: { rng: number }): number {
  const a = (holder.rng + 0x6d2b79f5) | 0;
  holder.rng = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const MAX_UINT32 = 0xffffffff;

/** Digit strings that fit in a uint32 are the seed itself, so `?seed=42` reads as 42. Anything else is hashed (FNV-1a). */
export function seedFromString(text: string): number {
  const s = text.trim();
  if (/^\d+$/.test(s) && Number(s) <= MAX_UINT32) return Number(s);
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

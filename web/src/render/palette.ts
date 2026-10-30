import { enemyTypes } from "../sim/enemies";
import type { EnemyKind } from "../sim/types";

export type PaletteName = "neon" | "colorblind";

export type Palette = {
  drone: string;
  pylon: string;
  pylonCore: string;
  bullet: string;
  bulletGlow: string;
  muzzle: string;
  health: { ok: string; warn: string; low: string };
  /** A Record, so a new enemy kind fails to typecheck until every palette gives it a color. */
  enemies: Record<EnemyKind, string>;
};

const neonEnemies = Object.fromEntries(Object.entries(enemyTypes).map(([kind, type]) => [kind, type.color])) as Record<EnemyKind, string>;

/** `colorblind` uses the Okabe-Ito set, which stays distinct under the common color vision deficiencies. */
export const palettes: Record<PaletteName, Palette> = {
  neon: {
    drone: "#29f3ff",
    pylon: "#ff2bd6",
    pylonCore: "#ffd6f6",
    bullet: "#fff9c4",
    bulletGlow: "#fff27a",
    muzzle: "#fffbe0",
    health: { ok: "#29f3ff", warn: "#ffd23f", low: "#ff3b5c" },
    enemies: neonEnemies,
  },
  colorblind: {
    drone: "#56B4E9",
    pylon: "#CC79A7",
    pylonCore: "#f2d7e6",
    bullet: "#F0E442",
    bulletGlow: "#F0E442",
    muzzle: "#fffbe0",
    health: { ok: "#0072B2", warn: "#F0E442", low: "#D55E00" },
    enemies: { crawler: "#E69F00", dasher: "#D55E00", splitter: "#009E73", splitling: "#7fd6be", shielded: "#c8c8c8", boss: "#0072B2" },
  },
};

/** Canvas has no color math, so translucent fills take a `#rrggbb` and an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

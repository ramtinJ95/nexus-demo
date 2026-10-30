import { seedFromString } from "./sim/rng";

/** A UTC calendar date as `YYYY-MM-DD`. Everyone on the same UTC day shares its daily seed. */
export type Day = string & { readonly __brand: "Day" };

export type Mode = { readonly kind: "classic" } | { readonly kind: "daily"; readonly day: Day };

export function dayOf(now: Date): Day {
  return now.toISOString().slice(0, 10) as Day;
}

export function dailySeed(day: Day): number {
  return seedFromString(`daily-${day}`);
}

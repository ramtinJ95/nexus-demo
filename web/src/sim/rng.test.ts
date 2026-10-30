import { describe, expect, it } from "vitest";
import { seedFromString } from "./rng";

describe("seedFromString", () => {
  it("reads digit seeds as the integer", () => {
    expect(seedFromString("42")).toBe(42);
    expect(seedFromString("0")).toBe(0);
    expect(seedFromString("4294967295")).toBe(4294967295);
  });

  it("hashes text seeds to a stable uint32", () => {
    const banana = seedFromString("banana");
    expect(seedFromString("banana")).toBe(banana);
    expect(seedFromString("bananas")).not.toBe(banana);
    for (const text of ["banana", "hello world", "4294967296", "-3", "🦋"]) {
      const seed = seedFromString(text);
      expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, text).toBe(true);
    }
  });
});

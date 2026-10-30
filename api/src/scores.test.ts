import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openScoreStore } from "./scores.ts";

describe("file-backed store", () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "pylon-scores-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test("a reopened store finds the earlier row", () => {
    const path = join(dir, "scores.db");
    const first = openScoreStore(path);
    const stored = first.insert({ name: "kept", score: 7, wave: 2 });
    first.close();

    const second = openScoreStore(path);
    assert.deepEqual(second.top(10), [stored]);
    second.close();
  });
});

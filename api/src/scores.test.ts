import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
    const stored = first.submit({ name: "kept", score: 7, wave: 2 }, null, 10).score;
    first.close();

    const second = openScoreStore(path);
    assert.deepEqual(second.top(10), [stored]);
    second.close();
  });

  test("a database from before run ids keeps its rows and dedupes new runs", () => {
    const path = join(dir, "old.db");
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, wave INTEGER NOT NULL, created_at TEXT NOT NULL)");
    old.exec("INSERT INTO scores (name, score, wave, created_at) VALUES ('old', 5, 1, '2026-01-01T00:00:00.000Z')");
    old.close();

    const store = openScoreStore(path);
    const entry = { name: "new", score: 9, wave: 2 };
    assert.equal(store.submit(entry, "run-00000001", 10).created, true);
    assert.equal(store.submit(entry, "run-00000001", 10).created, false);
    assert.deepEqual(store.top(10).map((s) => s.name), ["new", "old"]);
    store.close();
  });
});

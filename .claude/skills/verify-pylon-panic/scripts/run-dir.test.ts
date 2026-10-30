import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareRunDir } from "./run-dir.ts";

function sandbox() {
  const top = mkdtempSync(join(tmpdir(), "run-dir-"));
  const runs = join(top, "repo", ".verify", "runs");
  mkdirSync(runs, { recursive: true });
  const sentinel = join(top, "repo", "sentinel.txt");
  writeFileSync(sentinel, "keep");
  return { runs, sentinel };
}

test("unsafe run names are rejected and delete nothing outside the runs folder", () => {
  const { runs, sentinel } = sandbox();
  for (const name of ["..", "../..", "../../..", ".", "", "a/b", "../sentinel.txt", "/tmp", "..\\..", "x/../..", ".hidden", "a\0b", "a".repeat(101)]) {
    assert.throws(() => prepareRunDir(runs, name), `${JSON.stringify(name)} is rejected`);
    assert.equal(readFileSync(sentinel, "utf8"), "keep", `${JSON.stringify(name)} left the sentinel alone`);
    assert.ok(existsSync(runs), `${JSON.stringify(name)} left the runs folder alone`);
  }
});

test("a safe run name gets an empty folder directly inside the runs folder", () => {
  const { runs, sentinel } = sandbox();
  const first = prepareRunDir(runs, "core-loop-seed1337");
  assert.equal(first, join(runs, "core-loop-seed1337"));
  writeFileSync(join(first, "old.png"), "stale");
  prepareRunDir(runs, "core-loop-seed1337");
  assert.ok(!existsSync(join(first, "old.png")), "a rerun starts from an empty folder");
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
});

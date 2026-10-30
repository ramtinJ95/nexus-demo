import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openScoreStore } from "./scores.ts";
import type { ScoreStore } from "./scores.ts";
import { createApp } from "./server.ts";

let store: ScoreStore;
let server: Server;
let base: string;

async function stop(): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  store.close();
}

function post(body: unknown, contentType = "application/json"): Promise<Response> {
  return fetch(`${base}/api/scores`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<any> {
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  return res.json();
}

async function expectError(res: Response, status: number): Promise<void> {
  assert.equal(res.status, status);
  const body = await json(res);
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
}

const valid = { name: "ada", score: 100, wave: 3 };

describe("api", () => {
  beforeEach(async () => {
    store = openScoreStore(":memory:");
    server = createApp(store);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(stop);

  test("health answers ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { ok: true });
  });

  test("empty store lists no scores", async () => {
    const res = await fetch(`${base}/api/scores`);
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { scores: [] });
  });

  test("posted score is returned and listed", async () => {
    const res = await post({ ...valid, extra: "ignored" });
    assert.equal(res.status, 201);
    const { score } = await json(res);
    assert.equal(typeof score.id, "number");
    assert.ok(!Number.isNaN(Date.parse(score.createdAt)));
    assert.deepEqual(Object.keys(score).sort(), ["createdAt", "id", "name", "score", "wave"]);
    assert.deepEqual({ name: score.name, score: score.score, wave: score.wave }, valid);
    const list = await json(await fetch(`${base}/api/scores`));
    assert.deepEqual(list.scores, [score]);
  });

  test("scores order by score, then wave, then earliest", async () => {
    for (const entry of [
      { name: "low", score: 10, wave: 9 },
      { name: "first", score: 50, wave: 2 },
      { name: "second", score: 50, wave: 2 },
      { name: "deeper", score: 50, wave: 5 },
      { name: "top", score: 90, wave: 1 },
    ]) {
      assert.equal((await post(entry)).status, 201);
    }
    const { scores } = await json(await fetch(`${base}/api/scores`));
    assert.deepEqual(
      scores.map((s: { name: string }) => s.name),
      ["top", "deeper", "first", "second", "low"],
    );
  });

  test("limit defaults to 10 and caps the list", async () => {
    for (let i = 0; i < 12; i++) await post({ name: `p${i}`, score: i, wave: 1 });
    assert.equal((await json(await fetch(`${base}/api/scores`))).scores.length, 10);
    assert.equal((await json(await fetch(`${base}/api/scores?limit=1`))).scores[0].name, "p11");
    assert.equal((await json(await fetch(`${base}/api/scores?limit=100`))).scores.length, 12);
  });

  test("limit outside 1..100 or not an integer is rejected", async () => {
    for (const limit of ["0", "101", "-1", "2.5", "abc", "", "1e2"]) {
      await expectError(await fetch(`${base}/api/scores?limit=${limit}`), 400);
    }
  });

  test("name of exactly 16 characters is accepted", async () => {
    const res = await post({ ...valid, name: "a".repeat(16) });
    assert.equal(res.status, 201);
    assert.equal((await json(res)).score.name, "a".repeat(16));
  });

  test("name of 17 characters is rejected, not truncated", async () => {
    await expectError(await post({ ...valid, name: "a".repeat(17) }), 400);
    assert.deepEqual((await json(await fetch(`${base}/api/scores`))).scores, []);
  });

  test("whitespace-only, non-string, or control-character name is rejected", async () => {
    for (const name of ["   ", "", 42, null, "bad\u0007name", "tab\tname"]) {
      await expectError(await post({ ...valid, name }), 400);
    }
    await expectError(await post({ score: 1, wave: 1 }), 400);
  });

  test("name is stored trimmed", async () => {
    const res = await post({ ...valid, name: "  grace  " });
    assert.equal((await json(res)).score.name, "grace");
    assert.equal((await json(await fetch(`${base}/api/scores`))).scores[0].name, "grace");
  });

  test("score must be an integer from 0 to 1,000,000", async () => {
    for (const score of [-1, 1.5, "10", null, 1_000_001]) {
      await expectError(await post({ ...valid, score }), 400);
    }
    assert.equal((await post({ ...valid, score: 0 })).status, 201);
    assert.equal((await post({ ...valid, score: 1_000_000 })).status, 201);
  });

  test("wave must be an integer from 1 to 10,000", async () => {
    for (const wave of [0, 10_001, 2.5, "3"]) {
      await expectError(await post({ ...valid, wave }), 400);
    }
    assert.equal((await post({ ...valid, wave: 1 })).status, 201);
    assert.equal((await post({ ...valid, wave: 10_000 })).status, 201);
  });

  test("malformed JSON or a non-object body is rejected", async () => {
    await expectError(await post("{not json"), 400);
    await expectError(await post("[1,2]"), 400);
    await expectError(await post("null"), 400);
  });

  test("wrong content type is rejected", async () => {
    await expectError(await post(JSON.stringify(valid), "text/plain"), 415);
    assert.equal((await post(JSON.stringify(valid), "application/json; charset=utf-8")).status, 201);
  });

  test("body over 4 KB is rejected", async () => {
    await expectError(await post({ ...valid, pad: "x".repeat(5000) }), 413);
    assert.deepEqual((await json(await fetch(`${base}/api/scores`))).scores, []);
  });

  test("chunked body over 4 KB is rejected without content-length", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/api/scores`, {
        method: "POST",
        headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
      });
      req.on("response", (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.write(JSON.stringify({ ...valid, pad: "x".repeat(5000) }));
      req.end();
    });
    assert.equal(status, 413);
  });

  test("unknown path is 404", async () => {
    await expectError(await fetch(`${base}/api/nope`), 404);
  });

  test("wrong method on a known path is 405 with Allow", async () => {
    const res = await fetch(`${base}/api/scores`, { method: "DELETE" });
    await expectError(res, 405);
    assert.equal(res.headers.get("allow"), "GET, POST");
    const health = await fetch(`${base}/api/health`, { method: "POST" });
    await expectError(health, 405);
    assert.equal(health.headers.get("allow"), "GET");
  });
});

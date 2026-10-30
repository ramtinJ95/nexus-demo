import { describe, expect, test } from "vitest";
import { boardRows, panelAfter, submitScore, type ScoreRow } from "./leaderboard";

const row = (id: number, score: number): ScoreRow => ({ id, name: `p${id}`, score, wave: 1 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Reply = Response | Error;
function fakeFetch(post: Reply, list: Reply) {
  const calls: { path: string; init: RequestInit | undefined }[] = [];
  const fetch = async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const reply = init?.method === "POST" ? post : list;
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetch, calls };
}

const run = { score: 21, wave: 4 };

describe("boardRows", () => {
  test("ranks the top rows and marks the player's", () => {
    const rows = boardRows([row(1, 90), row(2, 50), row(3, 10)], row(2, 50), 2);
    expect(rows.map((r) => [r.rank, r.id, r.mine])).toEqual([
      [1, 1, false],
      [2, 2, true],
      [3, 3, false],
    ]);
  });

  test("appends the player below the top 10 with their rank when they are outside it", () => {
    const top = Array.from({ length: 10 }, (_, i) => row(i + 1, 100 - i));
    const rows = boardRows(top, row(99, 1), 14);
    expect(rows).toHaveLength(11);
    expect(rows.filter((r) => r.mine)).toEqual([{ ...row(99, 1), rank: 14, mine: true }]);
  });
});

describe("submitScore", () => {
  test("posts the name and run, then reads the top 10", async () => {
    const mine = row(7, 21);
    const { fetch, calls } = fakeFetch(json(201, { score: mine, rank: 1 }), json(200, { scores: [mine] }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "saved", mine, rank: 1, top: [mine] });
    expect(calls.map((c) => c.path)).toEqual(["/api/scores", "/api/scores?limit=10"]);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "Ada", score: 21, wave: 4 });
  });

  test("a network failure is offline", async () => {
    const { fetch } = fakeFetch(new TypeError("fetch failed"), json(200, { scores: [] }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "offline" });
  });

  test("a 5xx from the proxy is offline", async () => {
    const { fetch } = fakeFetch(new Response("", { status: 502 }), json(200, { scores: [] }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "offline" });
  });

  test("a 400 carries the API's message", async () => {
    const { fetch } = fakeFetch(json(400, { error: "name must not contain control characters" }), json(200, {}));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "rejected", error: "name must not contain control characters" });
  });

  test("a saved score whose board fails to load still reports the rank", async () => {
    const mine = row(7, 21);
    const { fetch } = fakeFetch(json(201, { score: mine, rank: 3 }), new TypeError("fetch failed"));
    const result = await submitScore(fetch, "Ada", run);
    expect(result).toEqual({ kind: "saved", mine, rank: 3, top: null });
    expect(panelAfter(run, result)).toMatchObject({ kind: "board", complete: false, rows: [{ id: 7, rank: 3, mine: true }] });
  });
});

describe("panelAfter", () => {
  test("offline keeps the run so the player can retry", () => {
    expect(panelAfter(run, { kind: "offline" })).toEqual({ kind: "offline", run });
  });

  test("a rejection returns to naming with the message", () => {
    expect(panelAfter(run, { kind: "rejected", error: "nope" })).toEqual({ kind: "naming", run, error: "nope" });
  });
});

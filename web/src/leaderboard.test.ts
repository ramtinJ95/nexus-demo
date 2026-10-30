import { afterEach, describe, expect, test, vi } from "vitest";
import type { Day } from "./daily";
import { boardRows, newRunId, panelAfter, submitScore, TIMEOUT_MS, type ScoreRow } from "./leaderboard";

const row = (id: number, score: number): ScoreRow => ({ id, name: `p${id}`, score, wave: 1 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(...replies: (Response | Error)[]) {
  const bodies: unknown[] = [];
  const fetch = async (_path: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const reply = replies.shift()!;
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetch, bodies };
}

const run = { id: "run-0000000a", score: 21, wave: 4, day: null };

test("run ids are fresh and match the API's runId rule", () => {
  const ids = new Set(Array.from({ length: 50 }, newRunId));
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

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
  test("posts the name, run and run id, and shows the board from the reply", async () => {
    const mine = row(7, 21);
    const { fetch, bodies } = fakeFetch(json(201, { score: mine, rank: 1, top: [mine] }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "saved", mine, rank: 1, top: [mine] });
    expect(bodies).toEqual([{ name: "Ada", score: 21, wave: 4, runId: "run-0000000a", day: null }]);
  });

  test("a daily run posts its day so the score lands on that day's board", async () => {
    const mine = row(7, 21);
    const { fetch, bodies } = fakeFetch(json(201, { score: mine, rank: 1, top: [mine] }));
    await submitScore(fetch, "Ada", { ...run, day: "2026-10-30" as Day });
    expect(bodies).toEqual([{ name: "Ada", score: 21, wave: 4, runId: "run-0000000a", day: "2026-10-30" }]);
  });

  test("a retry after a lost reply sends the same run id and takes the stored row", async () => {
    const mine = row(7, 21);
    const { fetch, bodies } = fakeFetch(new TypeError("fetch failed"), json(200, { score: mine, rank: 2, top: [row(1, 90), mine] }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "offline" });
    expect(await submitScore(fetch, "Ada", run)).toMatchObject({ kind: "saved", rank: 2 });
    expect(bodies.map((b) => (b as { runId: string }).runId)).toEqual(["run-0000000a", "run-0000000a"]);
  });

  test("a 5xx from the proxy is offline", async () => {
    const { fetch } = fakeFetch(new Response("", { status: 502 }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "offline" });
  });

  test("a 400 carries the API's message", async () => {
    const { fetch } = fakeFetch(json(400, { error: "name must not contain control characters" }));
    expect(await submitScore(fetch, "Ada", run)).toEqual({ kind: "rejected", error: "name must not contain control characters" });
  });
});

describe("submitScore against a hanging API", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const aborted = (signal: AbortSignal | null | undefined) =>
    new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));

  async function settleAt(pending: Promise<unknown>, ms: number) {
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(ms);
    return settled;
  }

  test("a request with no answer is offline at the deadline, and the run can still be retried", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const hanging = async (_path: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return aborted(init?.signal);
    };
    const pending = submitScore(hanging, "Ada", run);
    expect(await settleAt(pending, TIMEOUT_MS - 1)).toBe(false);
    expect(signals[0]!.aborted).toBe(false);
    expect(await settleAt(pending, 1)).toBe(true);
    expect(signals[0]!.aborted).toBe(true);
    const result = await pending;
    expect(result).toEqual({ kind: "offline" });
    expect(panelAfter(run, result)).toEqual({ kind: "offline", run });

    const mine = row(7, 21);
    const { fetch } = fakeFetch(json(200, { score: mine, rank: 1, top: [mine] }));
    expect(await submitScore(fetch, "Ada", run)).toMatchObject({ kind: "saved", rank: 1 });
  });

  test("headers that arrive with a body that stalls are offline at the deadline", async () => {
    vi.useFakeTimers();
    const stalled = async (_path: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason));
        },
      });
      return new Response(body, { status: 201, headers: { "content-type": "application/json" } });
    };
    const pending = submitScore(stalled, "Ada", run);
    expect(await settleAt(pending, TIMEOUT_MS - 1)).toBe(false);
    expect(await settleAt(pending, 1)).toBe(true);
    expect(await pending).toEqual({ kind: "offline" });
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

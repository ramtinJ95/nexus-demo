export const BOARD_SIZE = 10;
export const NAME_MAX = 16;

/** `id` is sent with every attempt, so the API stores a retried run once. */
export type Run = { readonly id: string; readonly score: number; readonly wave: number };

export function newRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ScoreRow = { readonly id: number; readonly name: string; readonly score: number; readonly wave: number };

export type BoardRow = ScoreRow & { readonly rank: number; readonly mine: boolean };

export type SubmitResult =
  | { readonly kind: "saved"; readonly mine: ScoreRow; readonly rank: number; readonly top: readonly ScoreRow[] }
  | { readonly kind: "rejected"; readonly error: string }
  | { readonly kind: "offline" };

/** What the game over panel shows. `offline` keeps the form so the player can retry. */
export type Panel =
  | { readonly kind: "hidden" }
  | { readonly kind: "naming"; readonly run: Run; readonly error: string | null }
  | { readonly kind: "submitting"; readonly run: Run }
  | { readonly kind: "offline"; readonly run: Run }
  | { readonly kind: "board"; readonly run: Run; readonly rows: readonly BoardRow[] };

export function boardRows(top: readonly ScoreRow[], mine: ScoreRow, rank: number): BoardRow[] {
  const rows = top.slice(0, BOARD_SIZE).map((row, i) => ({ ...row, rank: i + 1, mine: row.id === mine.id }));
  if (!rows.some((row) => row.mine)) rows.push({ ...mine, rank, mine: true });
  return rows;
}

export function panelAfter(run: Run, result: SubmitResult): Panel {
  switch (result.kind) {
    case "saved":
      return { kind: "board", run, rows: boardRows(result.top, result.mine, result.rank) };
    case "rejected":
      return { kind: "naming", run, error: result.error };
    case "offline":
      return { kind: "offline", run };
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export const TIMEOUT_MS = 4000;

/**
 * A network failure, a 5xx, or no full reply within `TIMEOUT_MS` is `offline`, and a retry with the same run is safe.
 * A 4xx carries the API's message.
 */
export async function submitScore(fetch: Fetch, name: string, run: Run): Promise<SubmitResult> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
  try {
    const posted = await fetch("/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, score: run.score, wave: run.wave, runId: run.id }),
      signal: deadline.signal,
    });
    if (posted.status >= 500) return { kind: "offline" };
    const reply = await posted.json().catch(() => null);
    if (!posted.ok) return { kind: "rejected", error: typeof reply?.error === "string" ? reply.error : `the API answered ${posted.status}` };
    if (typeof reply?.rank !== "number" || typeof reply.score?.id !== "number" || !Array.isArray(reply.top)) return { kind: "offline" };
    return { kind: "saved", mine: reply.score, rank: reply.rank, top: reply.top };
  } catch {
    return { kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

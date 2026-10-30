export const BOARD_SIZE = 10;
export const NAME_MAX = 16;

export type Run = { readonly score: number; readonly wave: number };

export type ScoreRow = { readonly id: number; readonly name: string; readonly score: number; readonly wave: number };

export type BoardRow = ScoreRow & { readonly rank: number; readonly mine: boolean };

export type SubmitResult =
  | { readonly kind: "saved"; readonly mine: ScoreRow; readonly rank: number; readonly top: readonly ScoreRow[] | null }
  | { readonly kind: "rejected"; readonly error: string }
  | { readonly kind: "offline" };

/** What the game over panel shows. `offline` keeps the form so the player can retry. */
export type Panel =
  | { readonly kind: "hidden" }
  | { readonly kind: "naming"; readonly run: Run; readonly error: string | null }
  | { readonly kind: "submitting"; readonly run: Run }
  | { readonly kind: "offline"; readonly run: Run }
  | { readonly kind: "board"; readonly run: Run; readonly rows: readonly BoardRow[]; readonly complete: boolean };

export function boardRows(top: readonly ScoreRow[], mine: ScoreRow, rank: number): BoardRow[] {
  const rows = top.slice(0, BOARD_SIZE).map((row, i) => ({ ...row, rank: i + 1, mine: row.id === mine.id }));
  if (!rows.some((row) => row.mine)) rows.push({ ...mine, rank, mine: true });
  return rows;
}

export function panelAfter(run: Run, result: SubmitResult): Panel {
  switch (result.kind) {
    case "saved":
      return { kind: "board", run, rows: boardRows(result.top ?? [], result.mine, result.rank), complete: result.top !== null };
    case "rejected":
      return { kind: "naming", run, error: result.error };
    case "offline":
      return { kind: "offline", run };
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 4000;

async function request(fetch: Fetch, path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
}

/** Posts the run, then reads the board. A network failure or a 5xx is `offline`; a 4xx carries the API's message. */
export async function submitScore(fetch: Fetch, name: string, run: Run): Promise<SubmitResult> {
  const posted = await request(fetch, "/api/scores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, score: run.score, wave: run.wave }),
  });
  if (posted === null || posted.status >= 500) return { kind: "offline" };
  const reply = await posted.json().catch(() => null);
  if (!posted.ok) return { kind: "rejected", error: typeof reply?.error === "string" ? reply.error : `the API answered ${posted.status}` };
  if (typeof reply?.rank !== "number" || typeof reply.score?.id !== "number") return { kind: "offline" };

  const listed = await request(fetch, `/api/scores?limit=${BOARD_SIZE}`);
  const top = listed?.ok ? ((await listed.json().catch(() => null))?.scores ?? null) : null;
  return { kind: "saved", mine: reply.score, rank: reply.rank, top };
}

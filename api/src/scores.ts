import { DatabaseSync } from "node:sqlite";

export type ScoreEntry = {
  readonly name: string;
  readonly score: number;
  readonly wave: number;
  /** The daily board's UTC date as `YYYY-MM-DD`, or null for the classic board. */
  readonly day: string | null;
};

export type StoredScore = ScoreEntry & {
  readonly id: number;
  readonly createdAt: string;
};

export type ParseResult =
  | { readonly ok: true; readonly entry: ScoreEntry; readonly runId: string | null }
  | { readonly ok: false; readonly error: string };

/** `rank` is 1-based in the `top` order, and `rank` and `top` come from the same read. */
export type Submitted = {
  readonly score: StoredScore;
  readonly created: boolean;
  readonly rank: number;
  readonly top: StoredScore[];
};

export type ScoreStore = {
  /** Stores the entry, or finds the row an earlier submit with the same `runId` stored. */
  submit(entry: ScoreEntry, runId: string | null, limit: number): Submitted;
  /** Lists one board: the classic one for a null `day`, otherwise that day's. */
  top(limit: number, day: string | null): StoredScore[];
  ping(): void;
  close(): void;
};

export const NAME_MAX = 16;
export const SCORE_MAX = 1_000_000;
export const WAVE_MAX = 10_000;
const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/;

const CONTROL_CHARS = /\p{Cc}/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DAY_ERROR = "day must be a real calendar date as YYYY-MM-DD";

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  // Date.parse rolls 2026-02-30 over to March, so a real date is one that prints back unchanged.
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function intInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

export function parseScoreEntry(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const { name, score, wave } = input as Record<string, unknown>;
  if (typeof name !== "string") return { ok: false, error: "name must be a string" };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "name must not be empty" };
  if (trimmed.length > NAME_MAX) {
    return { ok: false, error: `name must be at most ${NAME_MAX} characters` };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { ok: false, error: "name must not contain control characters" };
  }
  if (!intInRange(score, 0, SCORE_MAX)) {
    return { ok: false, error: `score must be an integer from 0 to ${SCORE_MAX}` };
  }
  if (!intInRange(wave, 1, WAVE_MAX)) {
    return { ok: false, error: `wave must be an integer from 1 to ${WAVE_MAX}` };
  }
  const { runId = null } = input as Record<string, unknown>;
  if (runId !== null && (typeof runId !== "string" || !RUN_ID.test(runId))) {
    return { ok: false, error: "runId must be 8 to 64 letters, digits, '_' or '-'" };
  }
  const { day = null } = input as Record<string, unknown>;
  if (day !== null && !isDay(day)) return { ok: false, error: DAY_ERROR };
  return { ok: true, entry: { name: trimmed, score, wave, day }, runId };
}

type Row = { id: number; name: string; score: number; wave: number; day: string | null; created_at: string };

function toStored(row: Row): StoredScore {
  return { id: row.id, name: row.name, score: row.score, wave: row.wave, day: row.day, createdAt: row.created_at };
}

export function openScoreStore(path: string): ScoreStore {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    DROP INDEX IF EXISTS scores_rank;
  `);
  const columns = db.prepare("SELECT name FROM pragma_table_info('scores')").all() as { name: string }[];
  if (!columns.some((c) => c.name === "run_id")) db.exec("ALTER TABLE scores ADD COLUMN run_id TEXT");
  if (!columns.some((c) => c.name === "day")) db.exec("ALTER TABLE scores ADD COLUMN day TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS scores_run_id ON scores (run_id)");
  db.exec("CREATE INDEX IF NOT EXISTS scores_board ON scores (day, score DESC, wave DESC, id ASC)");

  const insertStmt = db.prepare(
    "INSERT INTO scores (name, score, wave, day, created_at, run_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (run_id) DO NOTHING RETURNING *",
  );
  const byRunStmt = db.prepare("SELECT * FROM scores WHERE run_id = ?");
  // `day IS ?` matches NULL to NULL, so the classic board is the rows with no day.
  // id breaks ties inside one millisecond, where created_at alone cannot say which came first.
  const topStmt = db.prepare(
    "SELECT * FROM scores WHERE day IS ? ORDER BY score DESC, wave DESC, created_at ASC, id ASC LIMIT ?",
  );
  const rankStmt = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM scores
    WHERE day IS :day AND (
      score > :score
      OR (score = :score AND wave > :wave)
      OR (score = :score AND wave = :wave AND created_at < :createdAt)
      OR (score = :score AND wave = :wave AND created_at = :createdAt AND id < :id)
    )
  `);
  const pingStmt = db.prepare("SELECT 1");

  return {
    submit(entry, runId, limit) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const inserted = insertStmt.get(entry.name, entry.score, entry.wave, entry.day, new Date().toISOString(), runId) as Row | undefined;
        const score = toStored(inserted ?? (byRunStmt.get(runId) as Row));
        const { id, wave, day, createdAt } = score;
        const { rank } = rankStmt.get({ id, score: score.score, wave, day, createdAt }) as { rank: number };
        const top = (topStmt.all(day, limit) as Row[]).map(toStored);
        db.exec("COMMIT");
        return { score, created: inserted !== undefined, rank, top };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    top(limit, day) {
      return (topStmt.all(day, limit) as Row[]).map(toStored);
    },
    ping() {
      pingStmt.get();
    },
    close() {
      db.close();
    },
  };
}

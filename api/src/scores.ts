import { DatabaseSync } from "node:sqlite";

export type ScoreEntry = {
  readonly name: string;
  readonly score: number;
  readonly wave: number;
};

export type StoredScore = ScoreEntry & {
  readonly id: number;
  readonly createdAt: string;
};

export type ParseResult =
  | { readonly ok: true; readonly entry: ScoreEntry }
  | { readonly ok: false; readonly error: string };

export type ScoreStore = {
  insert(entry: ScoreEntry): StoredScore;
  top(limit: number): StoredScore[];
  /** 1-based position of a stored score in the `top` order. */
  rank(stored: StoredScore): number;
  ping(): void;
  close(): void;
};

export const NAME_MAX = 16;
export const SCORE_MAX = 1_000_000;
export const WAVE_MAX = 10_000;

const CONTROL_CHARS = /\p{Cc}/u;

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
  return { ok: true, entry: { name: trimmed, score, wave } };
}

type Row = { id: number; name: string; score: number; wave: number; created_at: string };

function toStored(row: Row): StoredScore {
  return { id: row.id, name: row.name, score: row.score, wave: row.wave, createdAt: row.created_at };
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
    CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, wave DESC, id ASC);
  `);
  const insertStmt = db.prepare(
    "INSERT INTO scores (name, score, wave, created_at) VALUES (?, ?, ?, ?) RETURNING *",
  );
  // id breaks ties inside one millisecond, where created_at alone cannot say which came first.
  const topStmt = db.prepare(
    "SELECT * FROM scores ORDER BY score DESC, wave DESC, created_at ASC, id ASC LIMIT ?",
  );
  const rankStmt = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM scores
    WHERE score > :score
      OR (score = :score AND wave > :wave)
      OR (score = :score AND wave = :wave AND created_at < :createdAt)
      OR (score = :score AND wave = :wave AND created_at = :createdAt AND id < :id)
  `);
  const pingStmt = db.prepare("SELECT 1");

  return {
    insert(entry) {
      const row = insertStmt.get(entry.name, entry.score, entry.wave, new Date().toISOString());
      return toStored(row as Row);
    },
    top(limit) {
      return (topStmt.all(limit) as Row[]).map(toStored);
    },
    rank({ id, score, wave, createdAt }) {
      return (rankStmt.get({ id, score, wave, createdAt }) as { rank: number }).rank;
    },
    ping() {
      pingStmt.get();
    },
    close() {
      db.close();
    },
  };
}

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { parseScoreEntry } from "./scores.ts";
import type { ScoreStore } from "./scores.ts";

const MAX_BODY_BYTES = 4096;
const LIMIT_DEFAULT = 10;
const LIMIT_MAX = 100;

type Reply = { readonly status: number; readonly body: unknown };
type Method = "GET" | "POST";
type Handler = (req: IncomingMessage, url: URL, store: ScoreStore) => Reply | Promise<Reply>;
type Routes = Readonly<Record<string, Partial<Record<Method, Handler>>>>;

function fail(status: number, error: string): Reply {
  return { status, body: { error } };
}

type BodyResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reply: Reply };

async function readJsonBody(req: IncomingMessage): Promise<BodyResult> {
  const type = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, reply: fail(415, "content-type must be application/json") };
  }
  const tooLarge: BodyResult = { ok: false, reply: fail(413, `body must be at most ${MAX_BODY_BYTES} bytes`) };
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES) return tooLarge;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return tooLarge;
    chunks.push(chunk);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, reply: fail(400, "body must be valid JSON") };
  }
}

function parseLimit(raw: string | null): number | undefined {
  if (raw === null) return LIMIT_DEFAULT;
  if (!/^\d+$/.test(raw)) return undefined;
  const limit = Number(raw);
  return limit >= 1 && limit <= LIMIT_MAX ? limit : undefined;
}

const routes: Routes = {
  "/api/health": {
    GET: (_req, _url, store) => {
      store.ping();
      return { status: 200, body: { ok: true } };
    },
  },
  "/api/scores": {
    GET: (_req, url, store) => {
      const limit = parseLimit(url.searchParams.get("limit"));
      if (limit === undefined) return fail(400, `limit must be an integer from 1 to ${LIMIT_MAX}`);
      return { status: 200, body: { scores: store.top(limit) } };
    },
    POST: async (req, _url, store) => {
      const body = await readJsonBody(req);
      if (!body.ok) return body.reply;
      const parsed = parseScoreEntry(body.value);
      if (!parsed.ok) return fail(400, parsed.error);
      return { status: 201, body: { score: store.insert(parsed.entry) } };
    },
  },
};

async function route(req: IncomingMessage, store: ScoreStore): Promise<Reply & { allow?: string }> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const methods = routes[url.pathname];
  if (methods === undefined) return fail(404, `no route for ${url.pathname}`);
  const handler = methods[req.method as Method];
  if (handler === undefined) {
    const allow = Object.keys(methods).join(", ");
    return { ...fail(405, `method ${req.method} not allowed, use ${allow}`), allow };
  }
  return handler(req, url, store);
}

function send(res: ServerResponse, reply: Reply & { allow?: string }): void {
  const payload = JSON.stringify(reply.body);
  res.statusCode = reply.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", Buffer.byteLength(payload));
  if (reply.allow !== undefined) res.setHeader("allow", reply.allow);
  // An early 413 leaves unread body bytes on the socket, so it cannot be reused.
  if (reply.status === 413) res.setHeader("connection", "close");
  res.end(payload);
}

export function createApp(store: ScoreStore): Server {
  return createServer((req, res) => {
    route(req, store).then(
      (reply) => send(res, reply),
      (error: unknown) => {
        console.error(error);
        send(res, fail(500, "internal server error"));
      },
    );
  });
}

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openScoreStore } from "./scores.ts";
import { createApp } from "./server.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const port = Number(process.env["PORT"] ?? 8787);
const host = process.env["HOST"] ?? "127.0.0.1";
const dbPath = resolve(repoRoot, process.env["PYLON_DB"] ?? "api/.data/scores.db");

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`invalid PORT: ${process.env["PORT"]}`);
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const store = openScoreStore(dbPath);
const server = createApp(store);

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;
  console.log(`api listening on http://${host}:${boundPort}`);
});

function shutdown(signal: string): void {
  process.removeAllListeners("SIGTERM").removeAllListeners("SIGINT");
  console.log(`api received ${signal}, closing`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

export const repoRoot = resolve(import.meta.dirname, "../../../..");
export const verifyDir = join(repoRoot, ".verify");
export const stackFile = join(verifyDir, "stack.json");

export type Stack = {
  apiUrl: string;
  webUrl: string;
  dataDir: string;
  pids: { api: number; web: number };
  startedAt: string;
};

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? done(address.port) : fail(new Error("no port"))));
    });
  });
}

async function waitFor(what: string, probe: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
}

function launch(name: string, command: string, args: string[], cwd: string, env: Record<string, string>): number {
  const log = openSync(join(verifyDir, `${name}.log`), "w");
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  if (child.pid === undefined) throw new Error(`could not start ${name}`);
  return child.pid;
}

export function readStack(): Stack | undefined {
  return existsSync(stackFile) ? (JSON.parse(readFileSync(stackFile, "utf8")) as Stack) : undefined;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Starts a private API with an empty database and a Vite dev server proxied to it. */
export async function up(): Promise<Stack> {
  if (readStack()) throw new Error(`a stack is already recorded in ${stackFile}. Run \`down\` first.`);
  mkdirSync(verifyDir, { recursive: true });
  const dataDir = join(verifyDir, "data");
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  const [apiPort, webPort] = [await freePort(), await freePort()];
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const api = launch("api", process.execPath, ["api/src/main.ts"], repoRoot, {
    PORT: String(apiPort),
    HOST: "127.0.0.1",
    PYLON_DB: join(dataDir, "scores.db"),
  });
  const web = launch("web", process.execPath, [join(repoRoot, "node_modules/vite/bin/vite.js")], join(repoRoot, "web"), {
    PORT: String(webPort),
    API_URL: apiUrl,
  });
  const stack: Stack = { apiUrl, webUrl, dataDir, pids: { api, web }, startedAt: new Date().toISOString() };
  writeFileSync(stackFile, JSON.stringify(stack, null, 2));

  await waitFor("api health", async () => (await fetch(`${apiUrl}/api/health`)).ok);
  await waitFor("web page", async () => (await (await fetch(webUrl)).text()).includes("Pylon Panic"));
  await waitFor("api through the web proxy", async () => (await fetch(`${webUrl}/api/health`)).ok);
  return stack;
}

export function down(): void {
  const stack = readStack();
  if (!stack) return;
  for (const pid of Object.values(stack.pids)) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {}
  }
  rmSync(stack.dataDir, { recursive: true, force: true });
  rmSync(stackFile, { force: true });
}

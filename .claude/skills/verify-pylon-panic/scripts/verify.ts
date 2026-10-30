#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { journeys } from "./journeys/index.ts";
import { down, isAlive, readStack, repoRoot, up, verifyDir, type Stack } from "./stack.ts";

const usage = `verify.ts <command>

  up                         start a private API (empty database) and web app, wait until both are usable
  doctor                     check that the recorded stack is alive, ours, and drivable
  capture <journey> [--seed S] [--name N]
                             drive one journey in Chromium and write evidence to .verify/runs/<name>/
  down                       stop what \`up\` started and delete its database; evidence stays
  run <journey> [--seed S] [--name N]
                             up, doctor, capture, down
  list                       print the journeys

Journeys: ${Object.keys(journeys).join(", ")}`;

const DEFAULT_SEED = "1337";
const GIF_MAX_SECONDS = 8;
const GIF_MAX_BYTES = 5 * 1024 * 1024;
const chromiumPath = process.env.PYLON_CHROMIUM ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

async function launchBrowser() {
  return chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
}

function requireStack(): Stack {
  const stack = readStack();
  if (!stack) throw new Error("no stack recorded. Run `up` first.");
  return stack;
}

async function doctor(): Promise<void> {
  const stack = requireStack();
  const failures: string[] = [];
  for (const [name, pid] of Object.entries(stack.pids)) if (!isAlive(pid)) failures.push(`${name} process ${pid} is not running`);
  const page = await fetch(stack.webUrl).then((r) => r.text()).catch((e: Error) => e.message);
  if (!page.includes("Pylon Panic")) failures.push(`${stack.webUrl} does not serve the game: ${page.slice(0, 120)}`);
  const health = await fetch(`${stack.webUrl}/api/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) failures.push(`${stack.webUrl}/api/health answered ${health}, so the proxy or API is down`);
  const browser = await launchBrowser().catch((e: Error) => (failures.push(`chromium did not launch: ${e.message}`), undefined));
  await browser?.close();
  for (const tool of ["ffmpeg", "ffprobe"]) {
    try {
      execFileSync(tool, ["-version"], { stdio: "ignore" });
    } catch {
      failures.push(`${tool} is not installed`);
    }
  }
  if (failures.length > 0) throw new Error(`doctor failed:\n- ${failures.join("\n- ")}`);
  console.log(`doctor: ok. web ${stack.webUrl}, api ${stack.apiUrl}, chromium ${chromiumPath ?? "playwright default"}`);
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function makeGif(video: string, gif: string, from: number, to: number): void {
  const seconds = Math.min(GIF_MAX_SECONDS, Math.max(1, to - from));
  for (const [fps, width] of [[15, 720], [12, 600], [10, 480]] as const) {
    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
    ffmpeg(["-ss", from.toFixed(2), "-t", seconds.toFixed(2), "-i", video, "-vf", filter, "-loop", "0", gif]);
    if (statSync(gif).size <= GIF_MAX_BYTES) return;
  }
  throw new Error(`${gif} is over ${GIF_MAX_BYTES} bytes even at the smallest size`);
}

async function capture(name: string, seed: string, runName: string): Promise<string> {
  const journey = journeys[name];
  if (!journey) throw new Error(`unknown journey ${name}. Known: ${Object.keys(journeys).join(", ")}`);
  const stack = requireStack();
  const out = join(verifyDir, "runs", runName);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const checks: { claim: string; ok: boolean }[] = [];
  const pageErrors: string[] = [];
  let clipFrom: number | undefined;
  let clipTo: number | undefined;
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: out, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const t0 = performance.now();
  const elapsed = () => (performance.now() - t0) / 1000;
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    const url = m.location().url;
    // Chromium asks for /favicon.ico on its own when it shows a non-HTML document such as an API response.
    if (m.type() === "error" && !url.endsWith("/favicon.ico")) pageErrors.push(`${m.text()} ${url}`.trim());
  });

  let failure: unknown;
  try {
    await journey.run({
      page,
      webUrl: stack.webUrl,
      seed,
      async open(path = "/") {
        const url = new URL(path, stack.webUrl);
        url.searchParams.set("seed", seed);
        await page.goto(url.href);
        await page.getByTestId("game").waitFor();
      },
      async shot(shotName) {
        await page.screenshot({ path: join(out, `${shotName}.png`) });
      },
      save(fileName, data) {
        writeFileSync(join(out, `${fileName}.json`), JSON.stringify(data, null, 2));
      },
      check(ok, claim) {
        checks.push({ claim, ok });
        console.log(`${ok ? "PASS" : "FAIL"} ${claim}`);
        if (!ok) throw new Error(`check failed: ${claim}`);
      },
      clip: { start: () => void (clipFrom = elapsed()), stop: () => void (clipTo = elapsed()) },
    });
    if (pageErrors.length > 0) throw new Error(`the page logged errors:\n${pageErrors.join("\n")}`);
  } catch (error) {
    failure = error;
  }
  const recorded = await page.video()?.path();
  await context.close();
  await browser.close();

  const artifacts: string[] = [];
  if (recorded) {
    const webm = join(out, `${name}.webm`);
    renameSync(recorded, webm);
    ffmpeg(["-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", join(out, `${name}.mp4`)]);
    if (clipFrom !== undefined && !failure) makeGif(webm, join(out, `${name}.gif`), clipFrom, clipTo ?? clipFrom + GIF_MAX_SECONDS);
  }
  for (const file of readdirSync(out).sort()) artifacts.push(file);
  const manifest = { journey: name, feature: journey.feature, seed, url: `${stack.webUrl}/?seed=${seed}`, passed: !failure, error: failure ? String(failure) : null, checks, pageErrors, artifacts, capturedAt: new Date().toISOString() };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`evidence: ${relative(repoRoot, out)}/ (${artifacts.join(", ")})`);
  if (failure) throw failure;
  return out;
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { seed: { type: "string" }, name: { type: "string" } } });
const [command, journey] = positionals;
const seed = values.seed ?? DEFAULT_SEED;
const runName = values.name ?? `${journey}-seed${seed}`;

try {
  if (command === "up") {
    const stack = await up();
    console.log(`up: web ${stack.webUrl}, api ${stack.apiUrl}`);
  } else if (command === "doctor") await doctor();
  else if (command === "down") {
    down();
    console.log("down: stopped");
  } else if (command === "list") for (const [key, j] of Object.entries(journeys)) console.log(`${key}\t${j.description}`);
  else if ((command === "capture" || command === "run") && journey) {
    if (command === "run") {
      down();
      await up();
    }
    try {
      if (command === "run") await doctor();
      await capture(journey, seed, runName);
    } finally {
      if (command === "run") down();
    }
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

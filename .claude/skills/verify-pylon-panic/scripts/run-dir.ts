import { mkdirSync, rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Empties and returns `<runsRoot>/<name>`, refusing any name that could resolve outside `runsRoot`. */
export function prepareRunDir(runsRoot: string, name: string): string {
  if (!SAFE_NAME.test(name) || name.includes("..")) {
    throw new Error(`run name ${JSON.stringify(name)} must be one folder name of letters, digits, '.', '_' or '-', without '..'`);
  }
  const root = resolve(runsRoot);
  const dir = resolve(root, name);
  const rel = relative(root, dir);
  if (rel === "" || rel.startsWith("..") || rel.includes(sep)) throw new Error(`run folder ${dir} is not directly inside ${root}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

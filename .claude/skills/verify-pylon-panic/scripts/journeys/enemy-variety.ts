import type { Page } from "playwright";
import type { Journey, JourneyContext } from "../journey.ts";

const ARENA = { width: 1280, height: 720 };
const number = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0] ?? NaN);

/**
 * The arena's edge, one key per leg. Each leg is held past the wall, so the walls re-anchor the drone every
 * lap however dasher shoves and input timing push it, and from the edge every shot at the pylon hits the
 * bugs in between from behind.
 */
const PERIMETER = [
  { keys: ["KeyS"], ms: 2400 },
  { keys: ["KeyD"], ms: 4200 },
  { keys: ["KeyW"], ms: 2400 },
  { keys: ["KeyA"], ms: 4200 },
];
const LAP_MS = PERIMETER.reduce((sum, leg) => sum + leg.ms, 0);

/** Plays blind the way a turret player would: hold fire with the aim on the pylon and patrol the edge. */
function player(page: Page) {
  let held: string[] = [];
  const patrolStart = Date.now();
  return {
    async start(): Promise<void> {
      const box = await page.locator('[data-testid="game"] > canvas').boundingBox();
      if (!box) throw new Error("canvas has no layout box");
      const scale = Math.min(box.width / ARENA.width, box.height / ARENA.height);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4 * scale);
      await page.mouse.down();
    },
    /** Keeps playing until `done` holds or the time runs out, and returns whether `done` held. */
    async until(done: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
      const deadline = Date.now() + timeoutMs;
      while (!(await done())) {
        if (Date.now() > deadline) return false;
        let at = (Date.now() - patrolStart) % LAP_MS;
        const leg = PERIMETER.find((l) => (at -= l.ms) < 0)!;
        for (const key of held.filter((k) => !leg.keys.includes(k))) await page.keyboard.up(key);
        for (const key of leg.keys.filter((k) => !held.includes(k))) await page.keyboard.down(key);
        held = leg.keys;
        await page.waitForTimeout(50);
      }
      return true;
    },
    async for(ms: number): Promise<void> {
      const end = Date.now() + ms;
      await this.until(async () => Date.now() >= end, ms + 1000);
    },
  };
}

type Player = ReturnType<typeof player>;

type Debut = {
  kind: "dasher" | "splitter" | "shielded";
  /** How a check names one bug of the kind. */
  noun: string;
  wave: number;
  description: string;
  /** Extra proof captured while the kind's debut wave is on the field. This stretch is the GIF. */
  prove(ctx: JourneyContext, kinds: () => Promise<string[]>, play: Player): Promise<void>;
};

function debutJourney({ kind, noun, wave, description, prove }: Debut): Journey {
  return {
    feature: "enemy-variety.md",
    description,
    async run(ctx) {
      const { page, open, shot, check, clip } = ctx;
      await open();
      const hudWave = async () => number(await page.getByTestId("hud-wave").textContent());
      const kinds = async () => ((await page.getByTestId("game").getAttribute("data-enemy-kinds")) ?? "").split(" ").filter(Boolean);
      const banner = page.getByTestId("hud-new-enemy");
      const alive = async () => (await page.getByTestId("game").getAttribute("data-phase")) === "playing";

      const play = player(page);
      await play.start();
      await play.until(async () => (await hudWave()) >= wave || !(await alive()), 240_000);
      check(await alive(), `the drone holds the pylon until wave ${wave}`);
      check(await banner.isVisible(), `wave ${wave} announces a new enemy`);
      check((await banner.getAttribute("data-kind")) === kind, `the wave ${wave} banner names the ${noun}`);

      check(await play.until(async () => (await kinds()).includes(kind), 20_000), `wave ${wave} opens with a ${noun}`);
      await shot(`01-${kind}-arrives`);
      clip.start();
      await prove(ctx, kinds, play);
      clip.stop();

      await play.until(async () => (await hudWave()) > wave || !(await alive()), 120_000);
      check((await hudWave()) > wave && (await alive()), `the drone clears wave ${wave}, every ${noun} included`);
      await shot(`04-wave-${wave}-cleared`);
      await page.mouse.up();
    },
  };
}

export const enemyDasher = debutJourney({
  kind: "dasher",
  noun: "dasher",
  wave: 2,
  description: "Play to wave 2, where dashers debut. They stop, wind up, and lunge at the patrolling drone.",
  async prove({ shot }, _kinds, play) {
    await play.for(3500);
    await shot("02-dasher-attacks");
    await play.for(3500);
  },
});

export const enemySplitter = debutJourney({
  kind: "splitter",
  noun: "splitter",
  wave: 3,
  description: "Play to wave 3, where splitters debut. A shot splitter breaks into two splitlings.",
  async prove({ shot, check }, kinds, play) {
    const split = await play.until(async () => (await kinds()).includes("splitling"), 30_000);
    check(split, "a splitter shot down by the drone breaks into splitlings");
    await shot("02-splitter-splits");
    await play.for(4000);
  },
});

export const enemyShielded = debutJourney({
  kind: "shielded",
  noun: "shielded bug",
  wave: 4,
  description: "Play to wave 4, where shielded bugs debut among every other kind and die only to shots from behind.",
  async prove({ shot, check }, kinds, play) {
    await play.for(3000);
    await shot("02-shielded-edge-patrol");
    const everyKind = ["crawler", "dasher", "splitter", "shielded"];
    const mixed = await play.until(async () => {
      const onField = await kinds();
      return everyKind.every((k) => onField.includes(k));
    }, 40_000);
    check(mixed, "crawlers, dashers, splitters and shielded bugs share the field in wave 4");
    await shot("03-mixed-wave");
    await play.for(2000);
  },
});

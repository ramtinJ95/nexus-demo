import type { Page } from "playwright";

export type JourneyContext = {
  page: Page;
  webUrl: string;
  seed: string;
  /** Loads `path` on the web app with `?seed=` set, and waits for the game root. */
  open(path?: string): Promise<void>;
  /** Saves `<name>.png` of the whole page. */
  shot(name: string): Promise<void>;
  /** Saves `<name>.json`, for side effects such as API responses. */
  save(name: string, data: unknown): void;
  /** Records a named assertion in the manifest and throws when it fails. */
  check(ok: boolean, claim: string): void;
  /** From now on, a console error matching `pattern` does not fail the run. Call it only after the journey causes that error on purpose. */
  allowConsoleError(pattern: RegExp): void;
  /** Marks the stretch of the recording that becomes the GIF. Keep it under 8 seconds. */
  clip: { start(): void; stop(): void };
};

/** The browser to drive. A `touch` device is a phone: it reports touch support and a coarse pointer. */
export type Device = { width: number; height: number; touch?: boolean };

export type Journey = {
  /** The feature map file this journey proves, relative to `features/`. */
  feature: string;
  description: string;
  /** Defaults to a 1280x720 desktop with a mouse. */
  device?: Device;
  run(ctx: JourneyContext): Promise<void>;
};

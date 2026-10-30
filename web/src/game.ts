import type { Settings } from "./sim/settings";
import { createGame, step } from "./sim/step";
import type { GameEvent, GameState, InputFrame } from "./sim/types";

export type GameEventType = GameEvent["type"];
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;
export type GameEventHandler<T extends GameEventType> = (event: GameEventOf<T>) => void;

export type Game = {
  readonly state: GameState;
  readonly settings: Settings;
  /** Subscribes to one event type. Returns an unsubscribe function. */
  on<T extends GameEventType>(type: T, handler: GameEventHandler<T>): () => void;
  restart(): void;
  stop(): void;
};

export type GameOptions = {
  seed: number;
  settings: Settings;
  readInput: () => InputFrame;
  onFrame: (state: GameState, now: number) => void;
};

/** A hidden tab resumes with one long frame. Capping it keeps catch-up to a handful of ticks instead of a spiral. */
const MAX_FRAME_SECONDS = 0.25;

export function startGame({ seed, settings, readInput, onFrame }: GameOptions): Game {
  const dt = 1 / settings.ticksPerSecond;
  const handlers = new Map<GameEventType, Set<(event: GameEvent) => void>>();
  let state = createGame(seed, settings);
  let accumulator = 0;
  let last = performance.now();
  let frameId = requestAnimationFrame(frame);

  function dispatch(event: GameEvent): void {
    for (const handler of handlers.get(event.type) ?? []) handler(event);
  }

  function frame(now: number): void {
    accumulator += Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    while (accumulator >= dt) {
      accumulator -= dt;
      for (const event of step(state, readInput(), settings)) dispatch(event);
    }
    onFrame(state, now);
    frameId = requestAnimationFrame(frame);
  }

  return {
    get state() {
      return state;
    },
    settings,
    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      const erased = handler as (event: GameEvent) => void;
      set.add(erased);
      return () => set.delete(erased);
    },
    restart() {
      state = createGame(seed, settings);
      accumulator = 0;
    },
    stop() {
      cancelAnimationFrame(frameId);
    },
  };
}

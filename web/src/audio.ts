import { musicLevel, musicLevels, notesAt, stepSeconds } from "./music";
import { debutKind, enemyTypes } from "./sim/enemies";
import type { GameEvent } from "./sim/types";

export type Tone = { wave: OscillatorType; from: number; to: number; seconds: number; gain: number; at: number };

export const soundedEvents = [
  "waveStarted",
  "waveCleared",
  "shotFired",
  "bugKilled",
  "pylonHit",
  "droneHit",
  "shieldBlocked",
  "gameOver",
] as const satisfies readonly GameEvent["type"][];

/** `newEnemy` replaces `waveStarted` on a wave that debuts a kind. */
export type SoundName = (typeof soundedEvents)[number] | "newEnemy";

export const sounds: Record<SoundName, readonly Tone[]> = {
  shotFired: [{ wave: "square", from: 880, to: 660, seconds: 0.04, gain: 0.03, at: 0 }],
  bugKilled: [{ wave: "triangle", from: 520, to: 1040, seconds: 0.12, gain: 0.25, at: 0 }],
  pylonHit: [{ wave: "sawtooth", from: 160, to: 70, seconds: 0.22, gain: 0.3, at: 0 }],
  droneHit: [
    { wave: "square", from: 320, to: 110, seconds: 0.16, gain: 0.14, at: 0 },
    { wave: "sawtooth", from: 90, to: 50, seconds: 0.2, gain: 0.2, at: 0 },
  ],
  shieldBlocked: [
    { wave: "triangle", from: 1760, to: 1480, seconds: 0.09, gain: 0.14, at: 0 },
    { wave: "square", from: 2640, to: 2640, seconds: 0.03, gain: 0.03, at: 0 },
  ],
  waveStarted: [
    { wave: "triangle", from: 440, to: 440, seconds: 0.12, gain: 0.2, at: 0 },
    { wave: "triangle", from: 659, to: 659, seconds: 0.2, gain: 0.2, at: 0.12 },
  ],
  newEnemy: [
    { wave: "square", from: 587, to: 880, seconds: 0.11, gain: 0.08, at: 0 },
    { wave: "square", from: 587, to: 880, seconds: 0.11, gain: 0.08, at: 0.15 },
    { wave: "sawtooth", from: 880, to: 880, seconds: 0.3, gain: 0.1, at: 0.3 },
  ],
  waveCleared: [
    { wave: "triangle", from: 523, to: 523, seconds: 0.1, gain: 0.18, at: 0 },
    { wave: "triangle", from: 659, to: 659, seconds: 0.1, gain: 0.18, at: 0.08 },
    { wave: "triangle", from: 784, to: 784, seconds: 0.1, gain: 0.18, at: 0.16 },
    { wave: "triangle", from: 1047, to: 1047, seconds: 0.3, gain: 0.2, at: 0.24 },
  ],
  gameOver: [
    { wave: "sawtooth", from: 440, to: 440, seconds: 0.22, gain: 0.25, at: 0 },
    { wave: "sawtooth", from: 349, to: 349, seconds: 0.22, gain: 0.25, at: 0.24 },
    { wave: "sawtooth", from: 294, to: 294, seconds: 0.22, gain: 0.25, at: 0.48 },
    { wave: "sawtooth", from: 220, to: 55, seconds: 0.9, gain: 0.3, at: 0.72 },
  ],
};

export function soundFor(event: GameEvent): SoundName | undefined {
  if (event.type === "waveStarted") {
    const debut = debutKind(event.wave);
    return debut && enemyTypes[debut].intro ? "newEnemy" : "waveStarted";
  }
  return Object.hasOwn(sounds, event.type) ? (event.type as SoundName) : undefined;
}

export type AudioState = "locked" | "running" | "unavailable";

export type Audio = {
  /** Call on a user gesture. Browsers keep an AudioContext silent until one. */
  unlock(): void;
  setVolumes(volumes: { music: number; sfx: number }): void;
  play(event: GameEvent): void;
  /** The wave whose music plays, or null for silence. Before `unlock` it only records the wish. */
  setMusic(wave: number | null): void;
  readonly state: AudioState;
  /** The 1-based `musicLevels` entry the music is set to, or null when it is off. */
  readonly level: number | null;
};

/** Steps are scheduled ahead on the audio clock, because timers jitter by tens of milliseconds and the clock does not. */
const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULE_EVERY_MS = 25;
const SILENT = 0.0001;

export function createAudio(makeContext: () => AudioContext = () => new AudioContext()): Audio {
  let volumes = { music: 0, sfx: 0 };
  let wave: number | null = null;
  /** Undefined until `unlock`, null when the browser has no Web Audio. */
  let graph: { ctx: AudioContext; music: GainNode; sfx: GainNode } | null | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  let nextStepAt = 0;

  function sound(ctx: AudioContext, out: GainNode, tone: Tone, start: number): void {
    const t = start + tone.at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.from, t);
    if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.seconds);
    env.gain.setValueAtTime(tone.gain, t);
    env.gain.exponentialRampToValueAtTime(SILENT, t + tone.seconds);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + tone.seconds);
  }

  function schedule(): void {
    if (!graph || wave === null) return;
    const { ctx, music } = graph;
    // A throttled background tab can stall the timer; skip the missed steps instead of starting them all at once.
    nextStepAt = Math.max(nextStepAt, ctx.currentTime);
    while (nextStepAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const level = musicLevels[musicLevel(wave)]!;
      if (volumes.music > 0) {
        for (const note of notesAt(level, step)) sound(ctx, music, { ...note, from: note.freq, to: note.freq, at: 0 }, nextStepAt);
      }
      nextStepAt += stepSeconds(level);
      step++;
    }
  }

  function syncMusic(): void {
    const on = Boolean(graph) && wave !== null;
    if (on && timer === undefined) {
      step = 0;
      nextStepAt = graph!.ctx.currentTime + 0.05;
      schedule();
      timer = setInterval(schedule, SCHEDULE_EVERY_MS);
    } else if (!on && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {
    unlock() {
      if (graph === undefined) {
        try {
          const ctx = makeContext();
          const bus = (volume: number) => {
            const gain = ctx.createGain();
            gain.gain.value = volume;
            gain.connect(ctx.destination);
            return gain;
          };
          graph = { ctx, music: bus(volumes.music), sfx: bus(volumes.sfx) };
        } catch {
          graph = null;
        }
        syncMusic();
      }
      if (graph?.ctx.state === "suspended") graph.ctx.resume().catch(() => {});
    },
    setVolumes(next) {
      volumes = { ...next };
      if (!graph) return;
      graph.music.gain.value = next.music;
      graph.sfx.gain.value = next.sfx;
    },
    play(event) {
      const name = soundFor(event);
      if (!name || !graph || graph.ctx.state !== "running" || volumes.sfx === 0) return;
      const { ctx, sfx } = graph;
      for (const tone of sounds[name]) sound(ctx, sfx, tone, ctx.currentTime);
    },
    setMusic(next) {
      wave = next;
      syncMusic();
    },
    get state() {
      if (graph === undefined) return "locked";
      if (graph === null || graph.ctx.state === "closed") return "unavailable";
      return graph.ctx.state === "running" ? "running" : "locked";
    },
    get level() {
      return wave === null ? null : musicLevel(wave) + 1;
    },
  };
}

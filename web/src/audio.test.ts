import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudio, soundedEvents, soundFor, sounds } from "./audio";
import { musicLevel } from "./music";
import type { GameEvent } from "./sim/types";

type FakeNode = { connections: FakeNode[]; connect(node: FakeNode): FakeNode };
type FakeParam = { value: number; setValueAtTime(value: number, time: number): void; exponentialRampToValueAtTime(): void };
type FakeOscillator = FakeNode & { frequency: FakeParam; startedAt: number | undefined; start(time: number): void; stop(): void };

function node(): FakeNode {
  const n: FakeNode = { connections: [], connect: (to) => (n.connections.push(to), to) };
  return n;
}

function param(): FakeParam {
  const p: FakeParam = { value: 0, setValueAtTime: (value) => void (p.value = value), exponentialRampToValueAtTime: () => {} };
  return p;
}

function fakeContext(state: AudioContextState = "running") {
  const oscillators: FakeOscillator[] = [];
  const ctx = {
    currentTime: 0,
    state,
    destination: node(),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator() {
      const osc: FakeOscillator = { ...node(), frequency: param(), startedAt: undefined, start: (t) => void (osc.startedAt = t), stop() {} };
      oscillators.push(osc);
      return osc;
    },
    resume: () => Promise.resolve().then(() => void (ctx.state = "running")),
  };
  const busVolume = (osc: FakeOscillator) => {
    const bus = osc.connections[0]!.connections[0] as FakeNode & { gain: FakeParam };
    expect(bus.connections).toContain(ctx.destination);
    return bus.gain.value;
  };
  return { ctx, oscillators, busVolume, make: vi.fn(() => ctx as unknown as AudioContext) };
}

function setup(volumes = { music: 0.3, sfx: 0.7 }) {
  const fake = fakeContext();
  const audio = createAudio(fake.make);
  audio.setVolumes(volumes);
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / 0.025); i++) {
      fake.ctx.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
  };
  const music = () => fake.oscillators.filter((osc) => fake.busVolume(osc) === volumes.music);
  const sfx = () => fake.oscillators.filter((osc) => fake.busVolume(osc) === volumes.sfx);
  return { ...fake, audio, advance, music, sfx };
}

const startsBetween = (oscs: FakeOscillator[], from: number, to: number) =>
  oscs.map((osc) => osc.startedAt!).filter((t) => t >= from && t < to);
const smallestGap = (times: number[]) => {
  const sorted = [...new Set(times.map((t) => Math.round(t * 1e6)))].sort((a, b) => a - b);
  return Math.min(...sorted.slice(1).map((t, i) => t - sorted[i]!)) / 1e6;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const gameOver: GameEvent = { type: "gameOver", score: 10, wave: 3, kills: 8 };

describe("audio", () => {
  it("makes no context and no sound before the first unlock, then plays the music it was asked for", () => {
    const { audio, make, advance, music } = setup();
    audio.setMusic(3);
    audio.play(gameOver);
    audio.play({ type: "waveStarted", wave: 2 });
    advance(1);
    expect(make).not.toHaveBeenCalled();
    expect(audio.state).toBe("locked");
    expect(audio.level).toBe(musicLevel(3) + 1);

    audio.unlock();
    audio.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(audio.state).toBe("running");
    advance(1);
    expect(music().length).toBeGreaterThan(0);
  });

  it("each volume sets its own bus, before and after unlock", () => {
    const { audio, advance, oscillators, busVolume } = setup({ music: 0.3, sfx: 0.7 });
    audio.unlock();
    audio.setMusic(1);
    audio.play(gameOver);
    advance(0.5);
    const volumes = () => new Set(oscillators.map(busVolume));
    expect(volumes()).toEqual(new Set([0.3, 0.7]));

    audio.setVolumes({ music: 0.3, sfx: 0.2 });
    expect(volumes()).toEqual(new Set([0.3, 0.2]));
    audio.setVolumes({ music: 0.9, sfx: 0.2 });
    expect(volumes()).toEqual(new Set([0.9, 0.2]));
  });

  it("a stalled timer skips the missed steps instead of starting them late", () => {
    const { audio, advance, ctx, music } = setup();
    audio.unlock();
    audio.setMusic(8);
    advance(0.5);
    ctx.currentTime += 2;
    const before = music().length;
    vi.advanceTimersByTime(25);
    const late = music().slice(before).filter((osc) => osc.startedAt! < ctx.currentTime);
    expect(music().length).toBeGreaterThan(before);
    expect(late).toHaveLength(0);
  });

  it("a later wave schedules more notes per bar, on a shorter step, into the music bus", () => {
    const density = (wave: number) => {
      const { audio, advance, music, sfx } = setup();
      audio.unlock();
      audio.setMusic(wave);
      advance(4);
      expect(sfx()).toHaveLength(0);
      const times = startsBetween(music(), 0.5, 3.5);
      return { perSecond: times.length / 3, step: smallestGap(times) };
    };
    const calm = density(1);
    const intense = density(8);
    expect(calm.perSecond).toBeGreaterThan(0);
    expect(intense.perSecond).toBeGreaterThan(calm.perSecond);
    expect(intense.step).toBeLessThan(calm.step);
  });

  it("a wave change takes effect while the music plays", () => {
    const { audio, advance, music } = setup();
    audio.unlock();
    audio.setMusic(1);
    advance(2);
    audio.setMusic(8);
    advance(2);
    expect(smallestGap(startsBetween(music(), 2.2, 4))).toBeLessThan(smallestGap(startsBetween(music(), 0, 2)));
  });

  it("no music wave stops scheduling, and a wave starts it again from now", () => {
    const { audio, advance, music, ctx } = setup();
    audio.unlock();
    audio.setMusic(1);
    advance(1);
    audio.setMusic(null);
    expect(audio.level).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    const scheduled = music().length;
    advance(2);
    expect(music()).toHaveLength(scheduled);
    const restartedAt = ctx.currentTime;
    audio.setMusic(1);
    advance(1);
    const restarted = music().slice(scheduled);
    expect(restarted.length).toBeGreaterThan(0);
    expect(Math.min(...restarted.map((osc) => osc.startedAt!))).toBeGreaterThanOrEqual(restartedAt);
  });

  it("a wave that debuts a kind plays the new-enemy alert, a plain wave plays the wave chime", () => {
    const freqs = (wave: number) => {
      const { audio, sfx } = setup();
      audio.unlock();
      audio.play({ type: "waveStarted", wave });
      return sfx().map((osc) => osc.frequency.value);
    };
    const alert = sounds.newEnemy.map((tone) => tone.from);
    const chime = sounds.waveStarted.map((tone) => tone.from);
    expect(alert).not.toEqual(chime);
    for (const wave of [2, 3, 4]) expect(freqs(wave)).toEqual(alert);
    for (const wave of [1, 5, 9]) expect(freqs(wave)).toEqual(chime);
  });

  it("game over plays a descending run of several notes", () => {
    const { audio, sfx } = setup();
    audio.unlock();
    audio.play(gameOver);
    const notes = sfx().map((osc) => ({ at: osc.startedAt!, freq: osc.frequency.value }));
    expect(notes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at);
      expect(notes[i]!.freq).toBeLessThan(notes[i - 1]!.freq);
    }
  });

  it("hits, shield blocks and cleared waves play, and an event without a sound plays nothing", () => {
    const { audio, sfx } = setup();
    audio.unlock();
    audio.play({ type: "bugHit", id: 1, kind: "crawler", pos: { x: 0, y: 0 } });
    expect(sfx()).toHaveLength(0);
    audio.play({ type: "shieldBlocked", pos: { x: 0, y: 0 } });
    audio.play({ type: "droneHit", pos: { x: 0, y: 0 } });
    audio.play({ type: "waveCleared", wave: 1 });
    expect(sfx().length).toBe(sounds.shieldBlocked.length + sounds.droneHit.length + sounds.waveCleared.length);
  });

  it("each sounded event maps to its own sound, and waveStarted to the alert only on a debut", () => {
    const at = { x: 0, y: 0 };
    const events: GameEvent[] = [
      { type: "waveCleared", wave: 1 },
      { type: "shotFired", pos: at, dir: at },
      { type: "bugKilled", kind: "crawler", pos: at },
      { type: "pylonHit", integrity: 90 },
      { type: "droneHit", pos: at },
      { type: "shieldBlocked", pos: at },
      gameOver,
    ];
    expect(events.map(soundFor)).toEqual(events.map((event) => event.type));
    expect(new Set([...events.map(soundFor), "waveStarted"])).toEqual(new Set(soundedEvents));
    expect(soundFor({ type: "bugHit", id: 1, kind: "crawler", pos: at })).toBeUndefined();
  });

  it("muted effects make no sound", () => {
    const { audio, oscillators } = setup({ music: 0.5, sfx: 0 });
    audio.unlock();
    audio.play(gameOver);
    expect(oscillators).toHaveLength(0);
  });

  it("a context the browser keeps suspended stays locked and silent until it runs", async () => {
    const fake = fakeContext("suspended");
    const audio = createAudio(fake.make);
    audio.setVolumes({ music: 0.5, sfx: 0.5 });
    audio.unlock();
    expect(audio.state).toBe("locked");
    audio.play(gameOver);
    expect(fake.oscillators).toHaveLength(0);
    await Promise.resolve();
    expect(audio.state).toBe("running");
    audio.play(gameOver);
    expect(fake.oscillators.length).toBeGreaterThan(0);
  });

  it("a browser without Web Audio reports unavailable and stays quiet", () => {
    const audio = createAudio(() => {
      throw new Error("no AudioContext");
    });
    audio.unlock();
    expect(audio.state).toBe("unavailable");
    expect(() => {
      audio.setMusic(2);
      audio.play(gameOver);
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(audio.level).toBe(musicLevel(2) + 1);
  });
});

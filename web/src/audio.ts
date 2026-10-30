import type { GameEvent } from "./sim/types";

export type Sfx = { play(event: GameEvent): void; setVolume(volume: number): void; resume(): void };

type Blip = { wave: OscillatorType; from: number; to: number; seconds: number; gain: number };

const blips: Partial<Record<GameEvent["type"], Blip>> = {
  shotFired: { wave: "square", from: 880, to: 660, seconds: 0.04, gain: 0.03 },
  bugKilled: { wave: "triangle", from: 520, to: 1040, seconds: 0.12, gain: 0.25 },
  pylonHit: { wave: "sawtooth", from: 160, to: 70, seconds: 0.22, gain: 0.3 },
  gameOver: { wave: "sawtooth", from: 440, to: 55, seconds: 1.1, gain: 0.35 },
};

/** Browsers start an AudioContext suspended until a user gesture, so it is made on the first gesture or sound, not at load. */
export function createSfx(): Sfx {
  let volume = 1;
  let audio: { ctx: AudioContext; master: GainNode } | null | undefined;

  function context() {
    if (audio !== undefined) return audio;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      audio = { ctx, master };
    } catch {
      audio = null;
    }
    return audio;
  }

  return {
    resume() {
      const a = context();
      if (a?.ctx.state === "suspended") a.ctx.resume().catch(() => {});
    },
    setVolume(v) {
      volume = v;
      if (audio) audio.master.gain.value = v;
    },
    play(event) {
      const blip = blips[event.type];
      const a = blip && volume > 0 ? context() : undefined;
      if (!blip || !a || a.ctx.state !== "running") return;
      const t = a.ctx.currentTime;
      const osc = a.ctx.createOscillator();
      const gain = a.ctx.createGain();
      osc.type = blip.wave;
      osc.frequency.setValueAtTime(blip.from, t);
      osc.frequency.exponentialRampToValueAtTime(blip.to, t + blip.seconds);
      gain.gain.setValueAtTime(blip.gain, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + blip.seconds);
      osc.connect(gain).connect(a.master);
      osc.start(t);
      osc.stop(t + blip.seconds);
    },
  };
}

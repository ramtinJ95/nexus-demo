export type Voice = "kick" | "bass" | "hat" | "arp" | "lead";

export type Note = { voice: Voice; freq: number; seconds: number; gain: number; wave: OscillatorType };

export type MusicLevel = { fromWave: number; bpm: number; voices: readonly Voice[] };

export const musicLevels: readonly MusicLevel[] = [
  { fromWave: 1, bpm: 96, voices: ["kick", "bass"] },
  { fromWave: 2, bpm: 108, voices: ["kick", "bass", "hat"] },
  { fromWave: 4, bpm: 120, voices: ["kick", "bass", "hat", "arp"] },
  { fromWave: 7, bpm: 132, voices: ["kick", "bass", "hat", "arp", "lead"] },
];

export const STEPS_PER_BAR = 16;

type Part = {
  wave: OscillatorType;
  gain: number;
  rootMidi: number;
  /** Drums keep their pitch. */
  followsChord: boolean;
  lengthSteps: number;
  /** One bar of scale degrees, null for a rest. */
  degrees: readonly (number | null)[];
};

const _ = null;

const parts: Record<Voice, Part> = {
  kick: { wave: "sine", gain: 0.55, rootMidi: 33, followsChord: false, lengthSteps: 1.5, degrees: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, 0, _] },
  bass: { wave: "sawtooth", gain: 0.12, rootMidi: 33, followsChord: true, lengthSteps: 1.5, degrees: [0, _, _, 0, _, _, 0, _, 0, _, _, 0, _, 7, _, 4] },
  hat: { wave: "square", gain: 0.02, rootMidi: 117, followsChord: false, lengthSteps: 0.25, degrees: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, 0] },
  arp: { wave: "square", gain: 0.04, rootMidi: 57, followsChord: true, lengthSteps: 0.8, degrees: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 2] },
  lead: { wave: "triangle", gain: 0.1, rootMidi: 69, followsChord: true, lengthSteps: 2, degrees: [4, _, _, 2, _, _, 4, _, 7, _, _, _, 6, _, 4, _] },
};

/** Semitones above A. */
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Chord roots per bar as scale degrees: Am, F, C, G. */
const PROGRESSION = [0, 5, 2, 6];

const semitones = (degree: number) => Math.floor(degree / 7) * 12 + NATURAL_MINOR[((degree % 7) + 7) % 7]!;
const hertz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The index into `musicLevels` that `wave` plays. */
export function musicLevel(wave: number): number {
  return Math.max(0, musicLevels.findLastIndex((level) => level.fromWave <= wave));
}

export function stepSeconds(level: MusicLevel): number {
  return 60 / level.bpm / 4;
}

/** The notes that start on `step`, counted from the start of the loop. */
export function notesAt(level: MusicLevel, step: number): Note[] {
  const root = PROGRESSION[Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length]!;
  return level.voices.flatMap((voice) => {
    const part = parts[voice];
    const degree = part.degrees[step % STEPS_PER_BAR];
    if (degree === null || degree === undefined) return [];
    const midi = part.rootMidi + semitones(degree + (part.followsChord ? root : 0));
    return [{ voice, freq: hertz(midi), seconds: part.lengthSteps * stepSeconds(level), gain: part.gain, wave: part.wave }];
  });
}

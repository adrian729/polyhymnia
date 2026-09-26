import { noteValueLength } from '@polyhymnia/notation-model';
import type { Key, NoteValue, Pitch, Time } from '@polyhymnia/notation-model';

export function fittingMeter(duration: NoteValue, count: number): Time {
  const length = noteValueLength(duration);
  if (!length) throw new RangeError(`Unsupported note value base: ${duration.base}`);
  let noteCount = length.n * count;
  let unit = length.d;
  while (noteCount % 2 === 0 && unit % 2 === 0 && unit > 4) {
    noteCount /= 2;
    unit /= 2;
  }
  return { count: noteCount, unit: unit as Time['unit'] };
}

export function durationKey(duration: NoteValue): string {
  return `${duration.base}.${duration.dots ?? 0}`;
}

export type ScaleName = 'major' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor';

const PATTERNS: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10, 12],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11, 12],
};

const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

function stepNumber(letter: Pitch['step']): number {
  return STEP_LETTERS.indexOf(letter);
}

function letterOf(n: number): Pitch['step'] {
  return STEP_LETTERS[((n % 7) + 7) % 7]!;
}

const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

export function scalePitches(
  root: Pitch,
  scale: ScaleName,
  descending = false,
): Pitch[] {
  const pattern =
    scale === 'melodicMinor' && descending ? PATTERNS.naturalMinor : PATTERNS[scale];
  const rootStep = stepNumber(root.step);
  const rootAlter = root.alter ?? 0;
  const rootSemitone = NATURAL_SEMITONES[rootStep]! + rootAlter + 12 * root.octave;

  const ascending = pattern.map((semitones, degree): Pitch => {
    const letterIndex = rootStep + degree;
    const step = letterOf(letterIndex);
    const octave = root.octave + Math.floor(letterIndex / 7);
    const natural = NATURAL_SEMITONES[stepNumber(step)]! + 12 * octave;
    const alter = clampAlter(rootSemitone + semitones - natural);
    return alter === 0 ? { step, octave } : { step, alter, octave };
  });

  return descending ? ascending.reverse() : ascending;
}

function clampAlter(alter: number): number {
  return Math.max(-2, Math.min(2, alter));
}

const MAJOR_FIFTHS_BASE = [0, 2, 4, -1, 1, 3, 5] as const;

export function scaleKey(root: Pitch, scale: ScaleName): Key {
  const majorFifths = MAJOR_FIFTHS_BASE[stepNumber(root.step)]! + 7 * (root.alter ?? 0);
  const fifths = scale === 'major' ? majorFifths : majorFifths - 3;
  return { fifths: clampFifths(fifths) };
}

function clampFifths(fifths: number): number {
  return Math.max(-7, Math.min(7, fifths));
}

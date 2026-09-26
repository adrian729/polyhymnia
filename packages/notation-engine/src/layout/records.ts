import { Rational as R } from '@polyhymnia/notation-model';
import type { NoteId as ModelNoteId, Rational } from '@polyhymnia/notation-model';

export type NoteId = ModelNoteId;

export type StepNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Alter = -2 | -1 | 0 | 1 | 2;

export interface Pitch {
  step: StepNumber;
  alter: Alter;
  octave: number;
}

export type DurationBase =
  | 'breve'
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | '16th'
  | '32nd'
  | '64th';

export type Dots = 0 | 1 | 2;

export interface NoteValueSpec {
  base: DurationBase;
  dots: Dots;
}

export type TupletBracketSetting = 'yes' | 'no' | 'auto';
export type TupletNumberSetting = 'noNumber' | 'inner' | 'both';

export interface TupletDisplay {
  bracket?: TupletBracketSetting;
  showNumber?: TupletNumberSetting;
  placement?: 'above' | 'below' | 'auto';
}

export interface TupletRef {
  id: string;
  actual: number;
  normal: number;
  display?: TupletDisplay;
}

export interface BeamSegment {
  level: number;
  first: NoteId;
  last: NoteId;
  hook?: 'left' | 'right';
}

export interface NormalizedBeam {
  id: string;
  measureIndex: number;
  voice: 0 | 1;
  elements: readonly NoteId[];
  segments: readonly BeamSegment[];
}

export interface NormalizedTie {
  id: string;
  from: NoteId;
  to: NoteId;
  side?: 'up' | 'down';
  measureIndex: number;
}

export interface Duration extends NoteValueSpec {
  tuplet?: TupletRef;
}

export type AccidentalPolicy = 'auto' | 'always' | 'never' | 'cautionary';

export interface ClefSpec {
  kind: 'treble' | 'bass' | 'alto' | 'tenor';
  octaveShift?: -1 | 0 | 1;
}

export interface KeySpec {
  fifths: number;
}

export interface TimeSpec {
  beats: number;
  beatType: number;
  symbol?: 'common' | 'cut';
}

export interface TempoEvent {
  tick: number;
  bpm: number;
  beatUnit?: NoteValueSpec;
}

export type TempoMap = readonly TempoEvent[];

export const DEFAULT_DIVISIONS = 3360;

export const DEFAULT_TIME: TimeSpec = { beats: 4, beatType: 4 };

export const DURATION_BASES: readonly DurationBase[] = [
  'breve',
  'whole',
  'half',
  'quarter',
  'eighth',
  '16th',
  '32nd',
  '64th',
];

export const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const STEP_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

const BASE_WHOLE_NOTES: Record<DurationBase, Rational> = {
  breve: { n: 2, d: 1 },
  whole: { n: 1, d: 1 },
  half: { n: 1, d: 2 },
  quarter: { n: 1, d: 4 },
  eighth: { n: 1, d: 8 },
  '16th': { n: 1, d: 16 },
  '32nd': { n: 1, d: 32 },
  '64th': { n: 1, d: 64 },
};

const DOT_FACTOR: readonly Rational[] = [
  { n: 1, d: 1 },
  { n: 3, d: 2 },
  { n: 7, d: 4 },
];

export function stepIndex(p: Pitch): number {
  return p.step + 7 * p.octave;
}

export function midiOf(p: Pitch): number {
  return 12 * (p.octave + 1) + STEP_SEMITONES[p.step]! + p.alter;
}

export function describePitch(p: Pitch): string {
  const alter =
    p.alter === 0
      ? ''
      : p.alter === 1
        ? ' sharp'
        : p.alter === -1
          ? ' flat'
          : p.alter === 2
            ? ' double sharp'
            : ' double flat';
  return `${STEP_LETTERS[p.step]}${alter} ${p.octave}`;
}

export function noteValueSpecLength(value: NoteValueSpec): Rational {
  return R.multiply(BASE_WHOLE_NOTES[value.base], DOT_FACTOR[value.dots]!);
}

interface Candidate {
  value: NoteValueSpec;
  length: Rational;
}

const CANDIDATES: readonly Candidate[] = DURATION_BASES.flatMap((base) =>
  ([0, 1, 2] as const).map((dots) => ({
    value: { base, dots },
    length: noteValueSpecLength({ base, dots }),
  })),
).sort((a, b) => R.compare(b.length, a.length));

const SHORTEST = CANDIDATES[CANDIDATES.length - 1]!.length;

export function decomposeLength(length: Rational): NoteValueSpec[] {
  const out: NoteValueSpec[] = [];
  let remaining = length;
  for (let guard = 0; guard < 64; guard += 1) {
    if (R.compare(remaining, SHORTEST) < 0) break;
    const pick = CANDIDATES.find((c) => R.compare(c.length, remaining) <= 0);
    if (!pick) break;
    out.push({ ...pick.value });
    remaining = R.subtract(remaining, pick.length);
    if (R.isZero(remaining)) break;
  }
  return out;
}

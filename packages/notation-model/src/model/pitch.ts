// Pure pitch arithmetic. Deliberately contains no y computation: pitch -> y is the
// `vertical` layout stage's job (architecture.md), and it needs a clef this module has
// no business knowing about.

import type { Pitch } from './types.js';

export type StepNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type StepLetter = (typeof STEP_LETTERS)[number];

/** Semitones above C for each diatonic step. */
const STEP_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export function stepOf(letter: string): StepNumber {
  const index = STEP_LETTERS.indexOf(letter.toUpperCase() as StepLetter);
  if (index < 0) throw new RangeError(`Unknown pitch letter: ${letter}`);
  return index as StepNumber;
}

export function letterOf(step: StepNumber): StepLetter {
  return STEP_LETTERS[step]!;
}

export function pitch(step: StepNumber, alter: Pitch['alter'], octave: number): Pitch {
  return { step, alter, octave };
}

/** Absolute diatonic step index — `stepOf(letter) + 7 x octave`, C4 = 28
 *  (architecture.md "Pitch -> y"). The one number the vertical stage turns into y. */
export function stepIndex(p: Pitch): number {
  return p.step + 7 * p.octave;
}

export function fromStepIndex(index: number, alter: Pitch['alter'] = 0): Pitch {
  const octave = Math.floor(index / 7);
  const step = (index - octave * 7) as StepNumber;
  return { step, alter, octave };
}

/** Signed distance in diatonic steps (staff positions), ignoring `alter`. */
export function diatonicDistance(from: Pitch, to: Pitch): number {
  return stepIndex(to) - stepIndex(from);
}

/** MIDI note number. C4 = 60. Used by accidental resolution and the timemap, never by
 *  layout geometry — `alter` must not move a notehead. */
export function midiOf(p: Pitch): number {
  return 12 * (p.octave + 1) + STEP_SEMITONES[p.step]! + p.alter;
}

/** Pitch class 0..11. */
export function pitchClassOf(p: Pitch): number {
  return ((midiOf(p) % 12) + 12) % 12;
}

export function chromaticDistance(from: Pitch, to: Pitch): number {
  return midiOf(to) - midiOf(from);
}

/** Same written pitch — step, alter and octave all equal. C#4 and Db4 are NOT equal
 *  (they sit on different staff positions); `midiOf` compares them enharmonically. */
export function pitchEquals(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

/** Transpose by diatonic steps, keeping `alter` — the caller re-resolves the
 *  accidental against the key if it wants a diatonic (rather than parallel) transpose. */
export function transposeDiatonic(p: Pitch, steps: number): Pitch {
  return fromStepIndex(stepIndex(p) + steps, p.alter);
}

/** "E flat 4" — the human-readable half of `ElementBox.label` (architecture.md). */
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
  return `${letterOf(p.step)}${alter} ${p.octave}`;
}

// Shared plumbing for the presets (interface.md "## Presets"). Nothing here is a
// feature of its own — it is the arithmetic the three thin wrappers would otherwise
// each repeat.

import { noteValueLength } from '@polyhymnia/notation-model';
import type { Key, NoteValue, Pitch, Time } from '@polyhymnia/notation-model';

/**
 * A meter that exactly fits `count` notes of `duration`, so a reveal is one full bar:
 * no auto-padded trailing rests, no underfull diagnostic, no barline cutting a scale in
 * half. A scale of eight quarters reads 8/4 — an honest signature for eight beats,
 * rather than two bars of 4/4 the exercise never asked for.
 */
export function fittingMeter(duration: NoteValue, count: number): Time {
  const length = noteValueLength(duration); // whole notes per note
  if (!length) throw new RangeError(`Unsupported note value base: ${duration.base}`);
  let noteCount = length.n * count;
  let unit = length.d;
  // Reduce while both stay integral and the beat unit stays a real note value.
  while (noteCount % 2 === 0 && unit % 2 === 0 && unit > 4) {
    noteCount /= 2;
    unit /= 2;
  }
  return { count: noteCount, unit: unit as Time['unit'] };
}

/** A stable dependency value for a `duration` prop, a fresh object literal on every
 *  render otherwise. */
export function durationKey(duration: NoteValue): string {
  return `${duration.base}.${duration.dots ?? 0}`;
}

// --- scale spelling ---------------------------------------------------------

export type ScaleName = 'major' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor';

/** Semitones above the root for scale degrees 1..8 (the octave closes every pattern). */
const PATTERNS: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10, 12],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11, 12],
  // Ascending form — raised 6th and 7th. The descending form is natural minor
  // (interface.md), resolved in `scalePitches`, not here.
  melodicMinor: [0, 2, 3, 5, 7, 9, 11, 12],
};

/** Step letters in pitch-class order, C first — the numbering `stepNumber`/`letterOf`
 *  work in, kept private here since the old model's `Pitch` (numeric step) is gone. */
const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

function stepNumber(letter: Pitch['step']): number {
  return STEP_LETTERS.indexOf(letter);
}

function letterOf(n: number): Pitch['step'] {
  return STEP_LETTERS[((n % 7) + 7) % 7]!;
}

/** Semitone of each natural letter above C. */
const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * The eight pitches of a scale, correctly *spelled*: one letter per degree, the
 * accidental derived from the semitone distance the pattern demands. D major therefore
 * spells F#/C# rather than Gb/Db, and A harmonic minor spells G# rather than Ab.
 *
 * `descending` on `melodicMinor` substitutes the natural-minor pattern — a genuinely
 * different pitch set, not the ascending notes reversed (interface.md). Every other
 * scale is direction-independent, so `descending` only reverses the order.
 */
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

/** The model only spells double flat .. double sharp; anything beyond it is a root no
 *  key signature would be written in (G# major), and clamping keeps the render legible
 *  instead of throwing. */
function clampAlter(alter: number): number {
  return Math.max(-2, Math.min(2, alter));
}

/** Natural letter's position on the circle of fifths (C=0), the same table
 *  engraving.md's key-signature ordering is built from. */
const MAJOR_FIFTHS_BASE = [0, 2, 4, -1, 1, 3, 5] as const; // C D E F G A B

/**
 * The key signature a scale's tonic implies — so a `ScaleReveal` can draw diatonic
 * degrees with no accidental at all (the horizontal-spacing engine already gives an
 * accidental-bearing column extra room; a scale that spells every altered degree inline
 * instead of via a key signature ends up with visibly uneven note spacing, since roughly
 * half its notes carry an accidental and half don't).
 *
 * `naturalMinor`/`harmonicMinor`/`melodicMinor` all key off the *natural* minor's
 * signature (the raised 6th/7th in harmonic/melodic minor are then genuinely
 * non-diatonic against it, so they still draw their own accidental — correctly, since
 * that's exactly how real notation shows those scales: a plain minor key signature plus
 * an inline raised leading tone).
 */
export function scaleKey(root: Pitch, scale: ScaleName): Key {
  const majorFifths = MAJOR_FIFTHS_BASE[stepNumber(root.step)]! + 7 * (root.alter ?? 0);
  const fifths = scale === 'major' ? majorFifths : majorFifths - 3;
  return { fifths: clampFifths(fifths) };
}

function clampFifths(fifths: number): number {
  return Math.max(-7, Math.min(7, fifths));
}

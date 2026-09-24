// Shared plumbing for the presets (interface.md "## Presets"). Nothing here is a
// feature of its own — it is the arithmetic the three thin wrappers would otherwise
// each repeat.

import { durationToRational, parseDuration } from '@earmaster/notation-core';
import type { Duration, DurationToken, Pitch, TimeSpec } from '@earmaster/notation-core';

/**
 * A meter that exactly fits `count` notes of `duration`, so a reveal is one full bar:
 * no auto-padded trailing rests, no underfull diagnostic, no barline cutting a scale in
 * half. A scale of eight quarters reads 8/4 — an honest signature for eight beats,
 * rather than two bars of 4/4 the exercise never asked for.
 */
export function fittingMeter(duration: DurationToken | Duration, count: number): TimeSpec {
  const length = durationToRational(parseDuration(duration)); // whole notes per note
  let beats = length.n * count;
  let beatType = length.d;
  // Reduce while both stay integral and the beat unit stays a real note value.
  while (beats % 2 === 0 && beatType % 2 === 0 && beatType > 4) {
    beats /= 2;
    beatType /= 2;
  }
  return { beats, beatType };
}

/** A stable dependency value for a `duration` prop, which may arrive as a token string
 *  or as a fresh `Duration` object literal on every render. */
export function durationKey(duration: DurationToken | Duration): string {
  return typeof duration === 'string'
    ? duration
    : `${duration.base}.${duration.dots}`;
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
  const rootSemitone = NATURAL_SEMITONES[root.step] + root.alter + 12 * root.octave;

  const ascending = pattern.map((semitones, degree): Pitch => {
    const letter = root.step + degree;
    const step = (letter % 7) as Pitch['step'];
    const octave = root.octave + Math.floor(letter / 7);
    const natural = NATURAL_SEMITONES[step] + 12 * octave;
    const alter = clampAlter(rootSemitone + semitones - natural);
    return { step, alter, octave };
  });

  return descending ? ascending.reverse() : ascending;
}

/** The model only spells double flat .. double sharp; anything beyond it is a root no
 *  key signature would be written in (G# major), and clamping keeps the render legible
 *  instead of throwing. */
function clampAlter(alter: number): Pitch['alter'] {
  return Math.max(-2, Math.min(2, alter)) as Pitch['alter'];
}

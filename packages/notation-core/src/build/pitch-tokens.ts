// PitchToken <-> Pitch (interface.md token grammars).

import { stepOf, letterOf } from '../model/pitch.js';
import type { StepNumber } from '../model/pitch.js';
import type { Pitch } from '../model/types.js';
import type { PitchToken } from '../model/tokens.js';

export type { PitchToken } from '../model/tokens.js';

const PITCH_RE = /^([A-Ga-g])(##|#|bb|b)?(-?\d+)$/;

const ALTER_BY_TOKEN: Record<string, Pitch['alter']> = {
  '': 0,
  '#': 1,
  '##': 2,
  b: -1,
  bb: -2,
};

function isPitchObject(value: unknown): value is Pitch {
  return typeof value === 'object' && value !== null && 'step' in value && 'octave' in value;
}

/**
 * Parse "C4" / "F#5" / "Bb3", or pass an already-constructed `Pitch` straight through.
 * The accidental is case-sensitive (`b` = flat, `B` = the letter); the letter is not.
 */
export function parsePitch(input: PitchToken | Pitch): Pitch {
  if (isPitchObject(input)) return normalizePitch(input);
  const match = PITCH_RE.exec(input);
  if (!match) throw new SyntaxError(`Invalid pitch token: ${JSON.stringify(input)}`);
  const [, letter, accidental, octave] = match;
  return {
    step: stepOf(letter!),
    alter: ALTER_BY_TOKEN[accidental ?? ''] ?? 0,
    octave: Number.parseInt(octave!, 10),
  };
}

function normalizePitch(p: Pitch): Pitch {
  const step = Math.max(0, Math.min(6, Math.trunc(p.step))) as StepNumber;
  const alter = Math.max(-2, Math.min(2, Math.trunc(p.alter ?? 0))) as Pitch['alter'];
  return { step, alter, octave: Math.trunc(p.octave) };
}

/** Inverse of `parsePitch` — `parsePitch(formatPitch(p))` is `p`. */
export function formatPitch(p: Pitch): PitchToken {
  const accidental =
    p.alter === 1 ? '#' : p.alter === 2 ? '##' : p.alter === -1 ? 'b' : p.alter === -2 ? 'bb' : '';
  return `${letterOf(p.step)}${accidental}${p.octave}` as PitchToken;
}

export function isPitchToken(value: unknown): value is PitchToken {
  return typeof value === 'string' && PITCH_RE.test(value);
}

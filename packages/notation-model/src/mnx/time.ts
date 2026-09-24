import * as R from './rational.js';
import type { Rational } from './rational.js';
import type { NoteValue, NoteValueQuantity, NoteValueBase, Tuplet } from './types.js';

const SUPPORTED_BASE_LENGTHS: Partial<Record<NoteValueBase, Rational>> = {
  breve: { n: 2, d: 1 },
  whole: { n: 1, d: 1 },
  half: { n: 1, d: 2 },
  quarter: { n: 1, d: 4 },
  eighth: { n: 1, d: 8 },
  '16th': { n: 1, d: 16 },
  '32nd': { n: 1, d: 32 },
  '64th': { n: 1, d: 64 },
};

function dotFactor(dots: number): Rational {
  let factor = R.ONE;
  let increment = R.ONE;
  for (let i = 0; i < dots; i += 1) {
    increment = R.multiply(increment, R.rational(1, 2));
    factor = R.add(factor, increment);
  }
  return factor;
}

export function noteValueLength(noteValue: NoteValue): Rational | null {
  const base = SUPPORTED_BASE_LENGTHS[noteValue.base];
  if (!base) return null;
  return R.multiply(base, dotFactor(noteValue.dots ?? 0));
}

export function tupletRatio(tuplet: Pick<Tuplet, 'inner' | 'outer'>): { actual: number; normal: number } | null {
  const inner = quantityLength(tuplet.inner);
  const outer = quantityLength(tuplet.outer);
  if (!inner || !outer) return null;
  const ratio = R.divide(inner, outer);
  return { actual: ratio.n, normal: ratio.d };
}

function quantityLength(quantity: NoteValueQuantity): Rational | null {
  const length = noteValueLength(quantity.duration);
  if (!length) return null;
  return R.multiply(length, R.rational(quantity.multiple));
}

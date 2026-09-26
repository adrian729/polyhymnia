import { describe, expect, it } from 'vitest';
import { noteValueLength, tupletRatio } from '../src/mnx/time.js';
import { Rational } from '../src/mnx/rational.js';
import type { NoteValue, Tuplet } from '../src/mnx/types.js';

describe('noteValueLength', () => {
  it('gives the length of every supported base in whole notes', () => {
    expect(noteValueLength({ base: 'breve' })).toEqual(Rational.of(2));
    expect(noteValueLength({ base: 'whole' })).toEqual(Rational.of(1));
    expect(noteValueLength({ base: 'half' })).toEqual(Rational.of(1, 2));
    expect(noteValueLength({ base: 'quarter' })).toEqual(Rational.of(1, 4));
    expect(noteValueLength({ base: 'eighth' })).toEqual(Rational.of(1, 8));
    expect(noteValueLength({ base: '16th' })).toEqual(Rational.of(1, 16));
    expect(noteValueLength({ base: '32nd' })).toEqual(Rational.of(1, 32));
    expect(noteValueLength({ base: '64th' })).toEqual(Rational.of(1, 64));
  });

  it('applies dots as half the previous increment', () => {
    expect(noteValueLength({ base: 'quarter', dots: 1 })).toEqual(Rational.of(3, 8));
    expect(noteValueLength({ base: 'quarter', dots: 2 })).toEqual(Rational.of(7, 16));
  });

  it('returns null for a base outside breve..64th', () => {
    const outOfRange: NoteValue[] = [
      { base: 'maxima' },
      { base: 'longa' },
      { base: 'duplexMaxima' },
      { base: '128th' },
      { base: '4096th' },
    ];
    for (const nv of outOfRange) expect(noteValueLength(nv)).toBeNull();
  });
});

describe('tupletRatio', () => {
  it('reads a plain 3:2 triplet (inner eighths, outer eighths)', () => {
    const tuplet: Pick<Tuplet, 'inner' | 'outer'> = {
      inner: { duration: { base: 'eighth' }, multiple: 3 },
      outer: { duration: { base: 'eighth' }, multiple: 2 },
    };
    expect(tupletRatio(tuplet)).toEqual({ actual: 3, normal: 2 });
  });

  it('normalizes mixed units: inner 3 eighths / outer 1 quarter -> 3:2', () => {
    const tuplet: Pick<Tuplet, 'inner' | 'outer'> = {
      inner: { duration: { base: 'eighth' }, multiple: 3 },
      outer: { duration: { base: 'quarter' }, multiple: 1 },
    };
    expect(tupletRatio(tuplet)).toEqual({ actual: 3, normal: 2 });
  });

  it('returns null when either side uses an unsupported base', () => {
    const tuplet: Pick<Tuplet, 'inner' | 'outer'> = {
      inner: { duration: { base: 'maxima' }, multiple: 1 },
      outer: { duration: { base: 'quarter' }, multiple: 1 },
    };
    expect(tupletRatio(tuplet)).toBeNull();
  });
});

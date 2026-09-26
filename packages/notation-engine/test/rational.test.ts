import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { noteValueLength, Rational as R, rational } from '@polyhymnia/notation-model';
import type { NoteValueBase } from '@polyhymnia/notation-model';
import { normalize } from '../src/layout/normalize.js';
import type { NormalizedElement } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import { DEFAULT_DIVISIONS, decomposeLength, noteValueSpecLength } from '../src/layout/records.js';
import { fixture, measure, mnx, note, tuplet } from './mnx.js';

function eventLengths(doc: Parameters<typeof normalize>[0]) {
  return normalize(doc)
    .staves[0]!.measures[0]!.voices[0]!.events.filter((e): e is NormalizedElement => e.kind !== 'space')
    .map((e) => e.length);
}

describe('Rational', () => {
  it('normalizes by gcd with the sign on the numerator', () => {
    expect(rational(6, 8)).toEqual({ n: 3, d: 4 });
    expect(rational(-6, 8)).toEqual({ n: -3, d: 4 });
    expect(rational(6, -8)).toEqual({ n: -3, d: 4 });
    expect(rational(0, 5)).toEqual({ n: 0, d: 1 });
  });

  it('sums repeated fractions exactly, where binary floats accumulate error', () => {
    const third = rational(1, 3);
    expect(R.add(R.add(third, third), third)).toEqual({ n: 1, d: 1 });

    const septuplet = rational(1, 14);
    const bar = Array.from({ length: 7 }, () => septuplet).reduce(R.add, R.ZERO);
    expect(bar).toEqual({ n: 1, d: 2 });

    const floatBar = Array.from({ length: 7 }, () => 1 / 14).reduce((a, b) => a + b, 0);
    expect(floatBar).not.toBe(0.5);
  });

  it('round-trips ticks at divisions=3360 for every notatable duration', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<NoteValueBase>('breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd'),
        fc.constantFrom(0, 1, 2),
        (base, dots) => {
          const length = noteValueLength({ base, dots })!;
          const ticks = R.toTicks(length, DEFAULT_DIVISIONS);
          expect(Number.isInteger(ticks)).toBe(true);
          expect(R.equals(R.fromTicks(ticks, DEFAULT_DIVISIONS), length)).toBe(true);
        },
      ),
    );
  });
});

describe('tuplet arithmetic', () => {
  it('keeps onsets integral through the temporal stage', () => {
    const map = temporal(normalize(fixture('triplet')));

    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([
      [0, 2240],
      [2240, 2240],
      [4480, 2240],
      [6720, 3360],
      [10080, 3360],
    ]);
    expect(map.measures[0]!.endTick).toBe(13440);
    expect(map.diagnostics).toEqual([]);
  });

  it('a 5:4 sixteenth septuplet-free quintuplet still lands on integer ticks', () => {
    const five = tuplet([5, '16'], [4, '16'], ...Array.from({ length: 5 }, () => note('C4', '16')));
    const doc = mnx({}, measure(five, note('D4', 'h.')));
    const total = eventLengths(doc)
      .slice(0, 5)
      .reduce((sum, l) => R.add(sum, l), R.ZERO);
    expect(total).toEqual({ n: 1, d: 4 });
    expect(temporal(normalize(doc)).elements[0]!.durationTicks).toBe(672);
  });
});

describe('capacities and decomposition', () => {
  it('knows which meters have no single notatable rest', () => {
    const single = (count: number, unit: number): boolean => decomposeLength(rational(count, unit)).length === 1;
    expect(single(4, 4)).toBe(true);
    expect(single(3, 4)).toBe(true);
    expect(single(6, 8)).toBe(true);
    expect(single(9, 8)).toBe(false);
    expect(single(5, 4)).toBe(false);
    expect(single(11, 8)).toBe(false);
  });

  it('decomposition always sums back to the length it was given', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (sixteenths) => {
        const total = decomposeLength(rational(sixteenths, 16))
          .map(noteValueSpecLength)
          .reduce((sum, l) => R.add(sum, l), R.ZERO);
        expect(total).toEqual(rational(sixteenths, 16));
      }),
    );
  });
});

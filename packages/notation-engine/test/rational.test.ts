// Exact arithmetic: the reason the temporal pass works in rationals and only collapses
// to integer ticks at the API boundary (data-model.md "Time").

import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  measure,
  note,
  resetIdCounter,
  score,
  tuplet,
  Rational as R,
  rational,
  durationToRational,
  durationToTicks,
  isNotatable,
  timeCapacity,
  DEFAULT_DIVISIONS,
} from '@polyhymnia/notation-model';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import { fillRests } from '../src/apply/fillRests.js';

beforeEach(() => resetIdCounter());

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

    // A 4/4 bar of 7:4 septuplet eighths: 7 x 1/14 of a whole note.
    const septuplet = rational(1, 14);
    const bar = Array.from({ length: 7 }, () => septuplet).reduce(R.add, R.ZERO);
    expect(bar).toEqual({ n: 1, d: 2 });

    // The same sum in floats misses by an epsilon, which is the bug class this type
    // exists to rule out of the temporal pass.
    const floatBar = Array.from({ length: 7 }, () => 1 / 14).reduce((a, b) => a + b, 0);
    expect(floatBar).not.toBe(0.5);
  });

  it('compares and orders without epsilon', () => {
    expect(R.compare(rational(1, 3), rational(1, 2))).toBe(-1);
    expect(R.compare(rational(2, 4), rational(1, 2))).toBe(0);
    expect(R.compare(rational(5, 8), rational(1, 2))).toBe(1);
  });

  it('is exact under add/subtract round-trips', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (an, ad, bn, bd) => {
          const a = rational(an, ad);
          const b = rational(bn, bd);
          expect(R.equals(R.subtract(R.add(a, b), b), a)).toBe(true);
          expect(R.equals(R.add(a, b), R.add(b, a))).toBe(true);
        },
      ),
    );
  });

  it('round-trips ticks at divisions=3360 for every notatable duration', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd'),
        fc.constantFrom(0, 1, 2),
        (base, dots) => {
          const duration = { base, dots } as never;
          const ticks = durationToTicks(duration, DEFAULT_DIVISIONS);
          expect(Number.isInteger(ticks)).toBe(true);
          expect(R.equals(R.fromTicks(ticks, DEFAULT_DIVISIONS), durationToRational(duration))).toBe(
            true,
          );
        },
      ),
    );
  });
});

describe('tuplet arithmetic', () => {
  it('3 x triplet-eighth === 1 quarter, exactly', () => {
    const [a, b, c] = tuplet(3, 2, note('C4', '8'), note('D4', '8'), note('E4', '8'));
    const lengths = [a!, b!, c!].map((el) => durationToRational(el.duration));
    const total = lengths.reduce((sum, l) => R.add(sum, l), R.ZERO);

    expect(lengths[0]).toEqual({ n: 1, d: 12 });
    expect(R.equals(total, durationToRational({ base: 'quarter', dots: 0 }))).toBe(true);
    expect(total).toEqual({ n: 1, d: 4 });
  });

  it('keeps onsets integral through the temporal stage', () => {
    const doc = score(
      { clef: 'treble' },
      measure(
        ...tuplet(3, 2, note('C4', 'q'), note('D4', 'q'), note('E4', 'q')),
        note('F4', 'q'),
        note('G4', 'q'),
      ),
    );
    const map = temporal(normalize(doc));

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
    const five = tuplet(5, 4, ...Array.from({ length: 5 }, () => note('C4', '16')));
    const total = five
      .map((el) => durationToRational(el.duration))
      .reduce((sum, l) => R.add(sum, l), R.ZERO);
    expect(total).toEqual({ n: 1, d: 4 });
    expect(durationToTicks(five[0]!.duration, DEFAULT_DIVISIONS)).toBe(672);
  });
});

describe('capacities and decomposition', () => {
  it('knows which meters have no single notatable rest', () => {
    expect(isNotatable(timeCapacity(4, 4))).toBe(true);
    expect(isNotatable(timeCapacity(3, 4))).toBe(true);
    expect(isNotatable(timeCapacity(6, 8))).toBe(true);
    expect(isNotatable(timeCapacity(9, 8))).toBe(false);
    expect(isNotatable(timeCapacity(5, 4))).toBe(false);
    expect(isNotatable(timeCapacity(11, 8))).toBe(false);
  });

  it('fillRests takes the largest shape that fits and recurses', () => {
    const sixteenth = DEFAULT_DIVISIONS / 4;
    expect(fillRests(5 * sixteenth, DEFAULT_DIVISIONS).map((r) => r.duration)).toEqual([
      { base: 'quarter', dots: 0 },
      { base: '16th', dots: 0 },
    ]);
    expect(fillRests(3 * DEFAULT_DIVISIONS, DEFAULT_DIVISIONS).map((r) => r.duration)).toEqual([
      { base: 'half', dots: 1 },
    ]);
    expect(fillRests(0, DEFAULT_DIVISIONS)).toEqual([]);
    expect(fillRests(-1, DEFAULT_DIVISIONS)).toEqual([]);
  });

  it('never emits wholeBar rests — that is spliceVoice territory', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (sixteenths) => {
        const rests = fillRests(sixteenths * (DEFAULT_DIVISIONS / 4), DEFAULT_DIVISIONS);
        expect(rests.every((r) => r.wholeBar === undefined)).toBe(true);
        const total = rests
          .map((r) => durationToRational(r.duration))
          .reduce((sum, l) => R.add(sum, l), R.ZERO);
        expect(total).toEqual(rational(sixteenths, 16));
      }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { beamGroups, type BeamableEvent } from '../src/mnx/beam.js';
import { rational as R } from '../src/mnx/rational.js';
import type { Rational } from '../src/mnx/rational.js';
import type { Meter } from '../src/mnx/meter.js';
import type { NoteValueBase } from '../src/mnx/types.js';

const BASE_LEN: Record<string, [number, number]> = {
  whole: [1, 1],
  half: [1, 2],
  quarter: [1, 4],
  eighth: [1, 8],
  '16th': [1, 16],
  '32nd': [1, 32],
};

function lengthOf(base: NoteValueBase, dots: 0 | 1 | 2 = 0): Rational {
  const [n, d] = BASE_LEN[base]!;
  const [dn, dd] = dots === 1 ? [3, 2] : dots === 2 ? [7, 4] : [1, 1];
  return R(n * dn, d * dd);
}

function ev(
  id: string,
  base: NoteValueBase,
  dots: 0 | 1 | 2 = 0,
  extra: { tupletId?: string; kind?: BeamableEvent['kind']; length?: Rational } = {},
): BeamableEvent {
  return {
    id,
    kind: extra.kind ?? 'note',
    base,
    dots,
    length: extra.length ?? lengthOf(base, dots),
    ...(extra.tupletId ? { tupletId: extra.tupletId } : {}),
  };
}

function chordEv(id: string, base: NoteValueBase, dots: 0 | 1 | 2 = 0): BeamableEvent {
  return ev(id, base, dots, { kind: 'chord' });
}

function restEv(id: string, base: NoteValueBase): BeamableEvent {
  return ev(id, base, 0, { kind: 'rest' });
}

function eighths(n: number): BeamableEvent[] {
  return Array.from({ length: n }, (_, i) => ev(`ev${i}`, 'eighth'));
}

describe('beamGroups() meter table (plain, unbroken eighths)', () => {
  const cases: [string, Meter, number, number[][]][] = [
    ['2/4 merges to one group of 4', { beats: 2, beatType: 4 }, 4, [[0, 1, 2, 3]]],
    ['3/4 merges to the whole bar', { beats: 3, beatType: 4 }, 6, [[0, 1, 2, 3, 4, 5]]],
    ['4/4 merges within each half, never across the middle', { beats: 4, beatType: 4 }, 8, [[0, 1, 2, 3], [4, 5, 6, 7]]],
    ['2/2 groups per half-note beat', { beats: 2, beatType: 2 }, 8, [[0, 1, 2, 3], [4, 5, 6, 7]]],
    ['3/8 is the whole bar', { beats: 3, beatType: 8 }, 3, [[0, 1, 2]]],
    ['6/8 groups of 3', { beats: 6, beatType: 8 }, 6, [[0, 1, 2], [3, 4, 5]]],
    ['9/8 groups of 3', { beats: 9, beatType: 8 }, 9, [[0, 1, 2], [3, 4, 5], [6, 7, 8]]],
    ['12/8 groups of 3', { beats: 12, beatType: 8 }, 12, [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]]],
    ['5/4 per quarter', { beats: 5, beatType: 4 }, 10, [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]],
    ['5/8 groups 3+2', { beats: 5, beatType: 8 }, 5, [[0, 1, 2], [3, 4]]],
    ['7/8 groups 2+2+3', { beats: 7, beatType: 8 }, 7, [[0, 1], [2, 3], [4, 5, 6]]],
  ];

  it.each(cases)('%s', (_name, meter, count, expected) => {
    const groups = beamGroups(meter, eighths(count));
    const numeric = groups.map((g) => g.map((id) => Number(id.replace('ev', ''))));
    expect(numeric).toEqual(expected);
  });

  it('4/4 without merging keeps every quarter beat separate', () => {
    const groups = beamGroups({ beats: 4, beatType: 4 }, eighths(8), { mergeBeats: false });
    expect(groups).toEqual([['ev0', 'ev1'], ['ev2', 'ev3'], ['ev4', 'ev5'], ['ev6', 'ev7']]);
  });

  it('3/4 without merging keeps every quarter beat separate', () => {
    const groups = beamGroups({ beats: 3, beatType: 4 }, eighths(6), { mergeBeats: false });
    expect(groups).toEqual([['ev0', 'ev1'], ['ev2', 'ev3'], ['ev4', 'ev5']]);
  });

  it('accepts a beatGrouping override', () => {
    const groups = beamGroups({ beats: 7, beatType: 8 }, eighths(7), { beatGrouping: { '7/8': [3, 4] } });
    expect(groups).toEqual([['ev0', 'ev1', 'ev2'], ['ev3', 'ev4', 'ev5', 'ev6']]);
  });

  it('falls back to the default grouping when a beatGrouping override does not sum to the bar', () => {
    const groups = beamGroups({ beats: 7, beatType: 8 }, eighths(7), { beatGrouping: { '7/8': [3, 3] } });
    expect(groups).toEqual([['ev0', 'ev1'], ['ev2', 'ev3'], ['ev4', 'ev5', 'ev6']]);
  });

  it('decides the 4/4 half-bar merge per half, not for the whole bar', () => {
    const events = [
      ev('a', 'eighth'),
      ev('b', 'eighth'),
      ev('c', 'eighth'),
      ev('d', 'eighth'),
      ev('q', 'quarter'),
      ev('e', 'eighth'),
      ev('f', 'eighth'),
    ];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f'],
    ]);
  });
});

describe('beamGroups() breaking', () => {
  it('breaks at rests', () => {
    const events = [ev('a', 'eighth'), restEv('r1', 'eighth'), ev('b', 'eighth'), ev('c', 'eighth'), restEv('r2', 'half')];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([['b', 'c']]);
  });

  it('breaks at notes a quarter or longer', () => {
    const events = [
      ev('a', 'eighth'),
      ev('b', 'eighth'),
      ev('q', 'quarter'),
      ev('c', 'eighth'),
      ev('d', 'eighth'),
      restEv('r', 'quarter'),
    ];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps tuplet content separate from surrounding plain notes', () => {
    const events = [
      ev('a', 'eighth'),
      ev('b', 'eighth'),
      ev('t1', 'eighth', 0, { tupletId: 'trip', length: R(1, 12) }),
      ev('t2', 'eighth', 0, { tupletId: 'trip', length: R(1, 12) }),
      ev('t3', 'eighth', 0, { tupletId: 'trip', length: R(1, 12) }),
      ev('c', 'eighth'),
      ev('d', 'eighth'),
      restEv('r', 'quarter'),
    ];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([
      ['a', 'b'],
      ['t1', 't2', 't3'],
      ['c', 'd'],
    ]);
  });

  it('breaks a dotted eighth + sixteenth at the micro beat boundary when mixed with plain eighths', () => {
    const events = [
      ev('a', 'eighth', 1),
      ev('b', '16th'),
      ev('c', 'eighth'),
      ev('d', 'eighth'),
      restEv('r', 'half'),
    ];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('beams chords the same as single notes', () => {
    const events = [chordEv('a', 'eighth'), chordEv('b', 'eighth'), restEv('r', 'half')];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(groups).toEqual([['a', 'b']]);
  });
});

describe('beamGroups() pickups and voices', () => {
  it('aligns a pickup measure to the bar end', () => {
    const events = [ev('a', 'eighth'), ev('b', 'eighth')];
    const groups = beamGroups({ beats: 4, beatType: 4 }, events, undefined, R(3, 4));
    expect(groups).toEqual([['a', 'b']]);
  });

  it('beams two sequences independently (each is its own call)', () => {
    const voice0 = [ev('a', 'eighth'), ev('b', 'eighth'), ev('q1', 'quarter'), ev('q2', 'quarter'), ev('q3', 'quarter')];
    const voice1 = [ev('x', 'eighth'), ev('y', 'eighth'), ev('q4', 'quarter'), ev('q5', 'quarter'), ev('q6', 'quarter')];
    expect(beamGroups({ beats: 4, beatType: 4 }, voice0)).toEqual([['a', 'b']]);
    expect(beamGroups({ beats: 4, beatType: 4 }, voice1)).toEqual([['x', 'y']]);
  });
});

describe('beamGroups() purity', () => {
  it('never mutates or throws on its input', () => {
    const events = Object.freeze(eighths(4));
    expect(() => beamGroups({ beats: 4, beatType: 4 }, events)).not.toThrow();
    const before = JSON.stringify(events);
    beamGroups({ beats: 4, beatType: 4 }, events);
    expect(JSON.stringify(events)).toBe(before);
  });

  it('is deterministic', () => {
    const events = eighths(8);
    const once = beamGroups({ beats: 4, beatType: 4 }, events);
    const twice = beamGroups({ beats: 4, beatType: 4 }, events);
    expect(twice).toEqual(once);
  });
});

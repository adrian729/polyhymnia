// The fullness rule, exercised through the real builder API (roadmap.md's
// integration-first testing philosophy) rather than through the internal helpers.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  BuildError,
  buildDiagnostics,
  chord,
  measure,
  note,
  resetIdCounter,
  rest,
  score,
  tuplet,
  voice,
  wholeBarRest,
} from '@polyhymnia/notation-model';
import type { RestEl, ScoreDoc, TimeSpec } from '@polyhymnia/notation-model';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';

const TREBLE = { clef: 'treble' } as const;
const NINE_EIGHT: TimeSpec = { beats: 9, beatType: 8 };

beforeEach(() => resetIdCounter());

function voice0(doc: ScoreDoc, measureIndex = 0) {
  return doc.staves[0]!.measures[measureIndex]!.voices[0]!;
}

function ticksOf(doc: ScoreDoc, measureIndex = 0) {
  const map = temporal(normalize(doc));
  return map.elements
    .filter((e) => e.measureIndex === measureIndex)
    .map((e) => [e.tick, e.durationTicks] as const);
}

describe('underfull', () => {
  it('auto-pads a trailing rest and warns', () => {
    const doc = score(TREBLE, measure(note('C4', 'q')));
    const elements = voice0(doc).elements;

    expect(elements).toHaveLength(2);
    expect(elements[1]!.kind).toBe('rest');
    // Greedy largest-that-fits: 3 quarters is one dotted half, not half + quarter.
    expect(elements[1]!.duration).toEqual({ base: 'half', dots: 1 });

    const diagnostics = buildDiagnostics(doc);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'warning',
      code: 'measure-underfull',
      measureIndex: 0,
      voice: 0,
    });
  });

  it('pads each voice independently', () => {
    const doc = score(
      TREBLE,
      measure(voice(0, note('C4', 'h'), note('D4', 'h')), voice(1, note('G3', 'q'))),
    );
    const [first, second] = doc.staves[0]!.measures[0]!.voices;
    expect(first!.elements).toHaveLength(2);
    expect(second!.elements).toHaveLength(2);
    expect(buildDiagnostics(doc)).toHaveLength(1);
    expect(buildDiagnostics(doc)[0]!.voice).toBe(1);
  });

  it('leaves an exactly-full measure untouched', () => {
    const doc = score(TREBLE, measure(note('C4', 'h'), note('D4', 'q'), note('E4', 'q')));
    expect(voice0(doc).elements).toHaveLength(3);
    expect(buildDiagnostics(doc)).toHaveLength(0);
  });
});

describe('overfull', () => {
  it('is a hard build error — the one throwing path in the system', () => {
    expect(() =>
      score(TREBLE, measure(note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q'), note('G4', 'q'))),
    ).toThrow(BuildError);
  });

  it('throws from measure() already when the measure states its own meter', () => {
    expect(() => measure({ time: { beats: 2, beatType: 4 } }, note('C4', 'h'), note('D4', 'h'))).toThrow(
      /overfull/,
    );
  });

  it('carries a diagnostic naming the measure and voice', () => {
    try {
      score(TREBLE, measure(note('C4', 'w')), measure(note('C4', 'w'), note('D4', 'q')));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BuildError);
      expect((error as BuildError).diagnostic).toMatchObject({
        code: 'measure-overfull',
        measureIndex: 1,
        voice: 0,
      });
    }
  });
});

describe('pickup measures', () => {
  it('are exempt: no auto-pad, no diagnostic', () => {
    const doc = score(TREBLE, measure({ pickup: true }, note('G3', 'q')), measure(note('C4', 'w')));
    expect(voice0(doc).elements).toHaveLength(1);
    expect(buildDiagnostics(doc)).toHaveLength(0);
  });

  it('shorten the measure rather than the score: capacity is what the content sums to', () => {
    const doc = score(TREBLE, measure({ pickup: true }, note('G3', 'q')), measure(note('C4', 'w')));
    const map = temporal(normalize(doc));
    expect(map.measures[0]!.capacityTicks).toBe(3360);
    expect(map.measures[1]!.startTick).toBe(3360);
    expect(map.measures[1]!.endTick).toBe(3360 + 13440);
    expect(map.diagnostics).toHaveLength(0);
  });

  it('does not restate the meter — a pickup sets no TimeSpec of its own', () => {
    const doc = score(TREBLE, measure({ pickup: true }, note('G3', 'q')), measure(note('C4', 'w')));
    expect(doc.staves[0]!.measures[0]!.time).toBeUndefined();
  });
});

describe('whole-bar rests in unrepresentable meters', () => {
  it('renders as a whole rest but consumes 9/8 of ticks', () => {
    const doc = score({ ...TREBLE, time: NINE_EIGHT }, measure(wholeBarRest()));
    const restEl = voice0(doc).elements[0] as RestEl;

    expect(restEl.wholeBar).toBe(true);
    // Pinned to a whole rest whatever the meter — never a breve or a dotted shape.
    expect(restEl.duration).toEqual({ base: 'whole', dots: 0 });
    expect(voice0(doc).elements).toHaveLength(1);
    expect(buildDiagnostics(doc)).toHaveLength(0);

    // 9 eighths at 3360 ticks/quarter = 9 x 1680, NOT the whole note's 13440.
    expect(ticksOf(doc)).toEqual([[0, 15120]]);
  });

  it('works the same via rest(duration, { wholeBar: true })', () => {
    const doc = score({ ...TREBLE, time: { beats: 5, beatType: 4 } }, measure(rest('h', { wholeBar: true })));
    const restEl = voice0(doc).elements[0] as RestEl;
    expect(restEl.duration.base).toBe('whole');
    expect(ticksOf(doc)).toEqual([[0, 16800]]);
  });

  it('takes only the remaining capacity when the bar has other content', () => {
    const doc = score({ ...TREBLE, time: NINE_EIGHT }, measure(note('C4', 'q'), wholeBarRest()));
    expect(buildDiagnostics(doc)).toHaveLength(0);
    expect(ticksOf(doc)).toEqual([
      [0, 3360],
      [3360, 15120 - 3360],
    ]);
  });
});

describe('chords and tuplets', () => {
  it('infers a chord duration from members that agree', () => {
    const doc = score(TREBLE, measure(chord([note('C4', 'w'), note('E4', 'w'), note('G4', 'w')])));
    const ch = voice0(doc).elements[0]!;
    expect(ch.kind).toBe('chord');
    expect(ch.duration).toEqual({ base: 'whole', dots: 0 });
    expect(buildDiagnostics(doc)).toHaveLength(0);
  });

  it('falls back to the shortest member when they disagree', () => {
    const ch = chord([note('C4', 'h'), note('E4', 'q')]);
    expect(ch.duration).toEqual({ base: 'quarter', dots: 0 });
    expect(ch.notes.every((n) => n.duration.base === 'quarter')).toBe(true);
  });

  it('shares one tuplet id across the group and fills the bar exactly', () => {
    const triplet = tuplet(3, 2, note('C4', 'q'), note('D4', 'q'), note('E4', 'q'));
    const doc = score(TREBLE, measure(...triplet, note('F4', 'h')));
    const ids = new Set(voice0(doc).elements.slice(0, 3).map((e) => e.duration.tuplet?.id));

    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeDefined();
    expect(buildDiagnostics(doc)).toHaveLength(0);
  });
});

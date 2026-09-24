// The fullness policy, exercised through the real normalize/temporal stages on MNX
// documents rather than through internal helpers.

import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { layoutScore } from '../src/layout/index.js';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import { chord, fixture, measure, mnx, note, tuplet } from './mnx.js';

function run(doc: MnxDocument) {
  return temporal(normalize(doc));
}

function elementsOf(doc: MnxDocument, measureIndex = 0, voice: 0 | 1 = 0) {
  return run(doc).elements.filter((e) => e.measureIndex === measureIndex && e.voice === voice);
}

function ticksOf(doc: MnxDocument, measureIndex = 0) {
  return run(doc)
    .elements.filter((e) => e.measureIndex === measureIndex)
    .map((e) => [e.tick, e.durationTicks] as const);
}

const FULL = measure(note('C4', 'w'));

describe('underfull', () => {
  it('auto-pads a trailing rest and warns', () => {
    const doc = mnx({}, FULL, measure(note('C4', 'q')));
    const elements = elementsOf(doc, 1);

    expect(elements).toHaveLength(2);
    expect(elements[1]!.kind).toBe('rest');
    // Greedy largest-that-fits: 3 quarters is one dotted half, not half + quarter.
    expect([elements[1]!.base, elements[1]!.dots]).toEqual(['half', 1]);

    const diagnostics = run(doc).diagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'warning',
      code: 'measure-underfull',
      measureIndex: 1,
      voice: 0,
    });
  });

  it('pads each voice independently', () => {
    const doc = fixture('two-voices');
    expect(elementsOf(doc, 0, 0)).toHaveLength(2);
    expect(elementsOf(doc, 0, 1)).toHaveLength(2);
    expect(run(doc).diagnostics).toHaveLength(1);
    expect(run(doc).diagnostics[0]!.voice).toBe(1);
  });

  it('leaves an exactly-full measure untouched', () => {
    const doc = mnx({}, measure(note('C4', 'h'), note('D4', 'q'), note('E4', 'q')));
    expect(elementsOf(doc)).toHaveLength(3);
    expect(run(doc).diagnostics).toHaveLength(0);
  });
});

describe('overfull', () => {
  it('is an error diagnostic, never a throw', () => {
    const doc = mnx({}, measure(note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q'), note('G4', 'q')));
    expect(() => layoutScore(doc)).not.toThrow();
    expect(run(doc).diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'measure-overfull' }),
    ]);
  });

  it('measures against the meter the measure itself states', () => {
    const doc = mnx({ time: { count: 2, unit: 4 } }, measure(note('C4', 'h'), note('D4', 'h')));
    expect(run(doc).diagnostics.map((d) => d.code)).toEqual(['measure-overfull']);
    expect(ticksOf(doc)).toEqual([[0, 6720]]);
  });

  it('carries a diagnostic naming the measure and voice', () => {
    const doc = mnx({}, FULL, measure(note('C4', 'w'), note('D4', 'q')));
    expect(run(doc).diagnostics[0]).toMatchObject({
      code: 'measure-overfull',
      measureIndex: 1,
      voice: 0,
    });
  });
});

describe('pickup measures', () => {
  const pickup = mnx({}, measure(note('G3', 'q')), FULL);

  it('are exempt: no auto-pad, no diagnostic', () => {
    expect(elementsOf(pickup)).toHaveLength(1);
    expect(run(pickup).diagnostics).toHaveLength(0);
  });

  it('shorten the measure rather than the score: capacity is what the content sums to', () => {
    const map = run(pickup);
    expect(map.measures[0]!.capacityTicks).toBe(3360);
    expect(map.measures[1]!.startTick).toBe(3360);
    expect(map.measures[1]!.endTick).toBe(3360 + 13440);
    expect(map.diagnostics).toHaveLength(0);
  });

  it('does not change the meter — only the first measure’s capacity is shortened', () => {
    const measures = normalize(pickup).staves[0]!.measures;
    expect(measures[0]!.time).toEqual({ beats: 4, beatType: 4 });
    expect(measures[1]!.time).toEqual({ beats: 4, beatType: 4 });
    expect(measures[1]!.pickup).toBe(false);
  });
});

describe('whole-bar rests in unrepresentable meters', () => {
  it('renders as a whole rest but consumes 9/8 of ticks', () => {
    const doc = mnx({ time: { count: 9, unit: 8 } }, { sequences: [{ content: [], fullMeasure: {} }] });
    const elements = elementsOf(doc);

    expect(elements[0]!.wholeBar).toBe(true);
    // Pinned to a whole rest whatever the meter — never a breve or a dotted shape.
    expect([elements[0]!.base, elements[0]!.dots]).toEqual(['whole', 0]);
    expect(elements).toHaveLength(1);
    expect(run(doc).diagnostics).toHaveLength(0);

    // 9 eighths at 3360 ticks/quarter = 9 x 1680, NOT the whole note's 13440.
    expect(ticksOf(doc)).toEqual([[0, 15120]]);
  });

  it('draws a whole rest whatever visualDuration a full-measure rest states', () => {
    const doc = mnx(
      { time: { count: 5, unit: 4 } },
      { sequences: [{ content: [], fullMeasure: { visualDuration: { base: 'half' } } }] },
    );
    expect(elementsOf(doc)[0]!.base).toBe('whole');
    expect(ticksOf(doc)).toEqual([[0, 16800]]);
  });

  it('takes only the remaining capacity when the bar has other content', () => {
    const doc = mnx({ time: { count: 9, unit: 8 } }, { sequences: [{ content: [note('C4', 'q')], fullMeasure: {} }] });
    expect(run(doc).diagnostics).toHaveLength(0);
    expect(ticksOf(doc)).toEqual([
      [0, 3360],
      [3360, 15120 - 3360],
    ]);
  });
});

describe('chords and tuplets', () => {
  it('takes a chord duration from its event', () => {
    const doc = mnx({}, measure(chord(['C4', 'E4', 'G4'], 'w')));
    const ch = elementsOf(doc)[0]!;
    expect(ch.kind).toBe('chord');
    expect([ch.base, ch.dots]).toEqual(['whole', 0]);
    expect(run(doc).diagnostics).toHaveLength(0);
  });

  it('gives every chord member the one event duration', () => {
    const layout = layoutScore(mnx({}, measure(chord(['C4', 'E4'], 'q'), note('D4', 'h.'))));
    const members = Object.values(layout.elements).filter((b) => b.kind === 'chord');
    expect(members).toHaveLength(2);
    expect(members.every((b) => b.durationTicks === 3360)).toBe(true);
  });

  it('shares one tuplet id across the group and fills the bar exactly', () => {
    const doc = mnx(
      {},
      measure(tuplet([3, 'q'], [2, 'q'], note('C4', 'q'), note('D4', 'q'), note('E4', 'q')), note('F4', 'h')),
    );
    const ids = new Set(elementsOf(doc).slice(0, 3).map((e) => e.tuplet?.id));

    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeDefined();
    expect(run(doc).diagnostics).toHaveLength(0);
  });
});

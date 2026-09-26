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

});

describe('overfull', () => {
  it('is an error diagnostic, never a throw', () => {
    const doc = mnx({}, measure(note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q'), note('G4', 'q')));
    expect(() => layoutScore(doc)).not.toThrow();
    expect(run(doc).diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'measure-overfull' }),
    ]);
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

});

describe('whole-bar rests in unrepresentable meters', () => {
  it('renders as a whole rest but consumes 9/8 of ticks', () => {
    const doc = mnx({ time: { count: 9, unit: 8 } }, { sequences: [{ content: [], fullMeasure: {} }] });
    const elements = elementsOf(doc);

    expect(elements[0]!.wholeBar).toBe(true);
    expect([elements[0]!.base, elements[0]!.dots]).toEqual(['whole', 0]);
    expect(elements).toHaveLength(1);
    expect(run(doc).diagnostics).toHaveLength(0);

    expect(ticksOf(doc)).toEqual([[0, 15120]]);
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

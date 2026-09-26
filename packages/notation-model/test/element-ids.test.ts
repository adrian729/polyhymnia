import { describe, expect, it } from 'vitest';
import { elementIds } from '../src/mnx/element-ids.js';
import { chord, grace, measure, mnx, note, rest, tremolo, tuplet, value } from './support.js';

const pos = (path: number[], extra: { note?: number; full?: boolean } = {}) => ({
  measureIndex: 0,
  sequenceIndex: 0,
  path,
  ...extra,
});

describe('elementIds', () => {
  it('assigns positional ids to events without an explicit id', () => {
    const doc = mnx(measure(note('C4', 'q'), note('D4', 'q'), rest('h')));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([0]))).toBe('m0.s0.e0');
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e1');
    expect(ids.idAt(pos([2]))).toBe('m0.s0.e2');
  });

  it('keeps an explicit id and mixes it with positional ones', () => {
    const doc = mnx(measure(note('C4', 'q', { id: 'my-note' }), note('D4', 'q')));
    const ids = elementIds(doc);
    const [e0] = doc.parts[0].measures[0].sequences[0].content as any[];
    expect(ids.idAt(pos([0]))).toBe('my-note');
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e1');
    expect(ids.nodeOf('my-note')?.node).toBe(e0);
  });

  it('gives a chord member id shaped {eventId}.n{k}', () => {
    const doc = mnx(measure(chord(['C4', 'E4', 'G4'], 'q')));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([0]))).toBe('m0.s0.e0');
    expect(ids.idAt(pos([0], { note: 0 }))).toBe('m0.s0.e0.n0');
    expect(ids.idAt(pos([0], { note: 1 }))).toBe('m0.s0.e0.n1');
    expect(ids.idAt(pos([0], { note: 2 }))).toBe('m0.s0.e0.n2');
  });

  it('gives a full-measure rest the .full suffix', () => {
    const doc = mnx({ sequences: [{ content: [], fullMeasure: {} }] } as any);
    const ids = elementIds(doc);
    expect(ids.idAt(pos([], { full: true }))).toBe('m0.s0.full');
  });

  it('advances the event counter past grace notes before an unlabeled event', () => {
    const doc = mnx(measure(grace(note('C4', '16')), note('D4', 'q')));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e1');
  });

  it('advances the event counter past a multi-note tremolo before an unlabeled event', () => {
    const doc = mnx(measure(tremolo(3, [1, 'q'], note('C4', '8'), note('D4', '8')), note('E4', 'q')));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e2');
  });

  it('disambiguates a positional id colliding with an explicit id, with an id-collision diagnostic', () => {
    const doc = mnx(measure(note('C4', 'q', { id: 'm0.s0.e1' }), note('D4', 'q'), note('E4', 'q')));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([0]))).toBe('m0.s0.e1');
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e1~2');
    expect(ids.idAt(pos([2]))).toBe('m0.s0.e2');
    expect(ids.diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'id-collision' }),
    ]);
  });

  it('mint continues the same used-id set as the main pass', () => {
    const doc = mnx(measure(note('C4', 'q')));
    const ids = elementIds(doc);
    expect(ids.mint('m0.s0.e0')).toBe('m0.s0.e0~2');
  });

  it('gives a shared event object distinct ids at each of its positions', () => {
    const shared = note('C4', 'q');
    const doc = mnx(measure(shared, shared));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([0]))).toBe('m0.s0.e0');
    expect(ids.idAt(pos([1]))).toBe('m0.s0.e1');
    expect(ids.nodeOf('m0.s0.e0')?.path).toEqual([0]);
    expect(ids.nodeOf('m0.s0.e1')?.path).toEqual([1]);
  });

  it('gives a shared note object distinct ids at each event that references it', () => {
    const sharedNote = { pitch: { step: 'C', octave: 4 } };
    const eventA: any = { duration: value('q'), notes: [sharedNote] };
    const eventB: any = { duration: value('q'), notes: [sharedNote] };
    const doc = mnx(measure(eventA, eventB));
    const ids = elementIds(doc);
    expect(ids.idAt(pos([0], { note: 0 }))).toBe('m0.s0.e0');
    expect(ids.idAt(pos([1], { note: 0 }))).toBe('m0.s0.e1');
  });
});

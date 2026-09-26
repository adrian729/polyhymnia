import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyIntent, parsePitch } from '@polyhymnia/notation-model';
import { layoutScore } from '../src/layout/index.js';
import { hitTest } from '../src/query/hitTest.js';
import { previewShapes } from '../src/query/preview.js';
import type { ElementBox, LayoutResult } from '../src/layout/types.js';
import { ALTO, BASS, measure, mnx, note, rest, tuplet, voices } from './mnx.js';

function boxes(layout: LayoutResult): ElementBox[] {
  return Object.values(layout.elements);
}

function center(box: ElementBox): { x: number; y: number } {
  return { x: box.hitBox.x + box.hitBox.w / 2, y: box.hitBox.y + box.hitBox.h / 2 };
}

describe('pitch derivation', () => {
  it('reads F#5 off the F line in D major, or F natural with insertAlteration: natural', () => {
    const doc = mnx({ key: 2 }, measure(rest('w')));
    const layout = layoutScore(doc);
    const system = layout.systems[0]!;

    const keyed = hitTest(layout, { x: layout.measures[0]!.contentX, y: system.y }, { kinds: ['point'] });
    expect(keyed?.kind).toBe('point');
    expect(keyed?.pitch).toEqual({ step: 'F', octave: 5, alter: 1 });

    const natural = hitTest(
      layout,
      { x: layout.measures[0]!.contentX, y: system.y },
      { kinds: ['point'], insertAlteration: 'natural' },
    );
    expect(natural?.pitch).toEqual({ step: 'F', octave: 5 });
  });

  it('returns a pitch and tick 0 for a point in an empty whole-rest measure', () => {
    const doc = mnx({}, measure(rest('w')));
    const layout = layoutScore(doc);
    const system = layout.systems[0]!;
    const hit = hitTest(
      layout,
      { x: layout.measures[0]!.contentX, y: system.y + 2 },
      { kinds: ['point'] },
    );
    expect(hit?.kind).toBe('point');
    expect(hit?.pitch).toBeTruthy();
    expect(hit && hit.kind === 'point' ? hit.tick : null).toBe(0);
  });
});

describe('slots', () => {
  it('tiles a measure with no gaps or overlaps, one slot per quarter', () => {
    const doc = mnx({}, measure(note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q')));
    const layout = layoutScore(doc);
    const measureBox = layout.measures[0]!;
    const bands = layout.slots.filter((s) => s.measureIndex === 0).slice().sort((a, b) => a.x - b.x);

    expect(bands).toHaveLength(4);
    expect(bands[0]!.x).toBeCloseTo(measureBox.contentX, 5);
    for (let i = 0; i + 1 < bands.length; i += 1) {
      expect(bands[i]!.x + bands[i]!.w).toBeCloseTo(bands[i + 1]!.x, 5);
    }
    const totalWidth = bands.reduce((sum, b) => sum + b.w, 0);
    const span = bands[bands.length - 1]!.x + bands[bands.length - 1]!.w - bands[0]!.x;
    expect(totalWidth).toBeCloseTo(span, 5);
  });

});

describe('element hit-testing (chords)', () => {
  it('picks the nearest chord member by staffPosition', () => {
    const chord = (pitches: readonly string[]) => ({
      duration: { base: 'whole' as const },
      notes: pitches.map((p) => ({ pitch: parsePitch(p) })),
    });
    const doc = mnx({}, measure(chord(['C4', 'E4', 'G4', 'B4'])));
    const layout = layoutScore(doc);
    const members = boxes(layout).filter((b) => b.kind === 'chord');
    const target = members.find((m) => m.staffPosition === 3)!;

    const hit = hitTest(layout, { x: target.x + target.w / 2, y: target.y + target.h / 2 }, { kinds: ['element'] });
    expect(hit?.kind).toBe('element');
    expect(hit && hit.kind === 'element' ? hit.id : null).toBe(target.id);
  });

  it('honours a kinds restriction even when a notehead sits exactly under the point', () => {
    const doc = mnx({}, measure(note('C4', 'q')));
    const layout = layoutScore(doc);
    const box = boxes(layout)[0]!;
    const hit = hitTest(layout, center(box), { kinds: ['slot'] });
    expect(hit).not.toBeNull();
    expect(hit?.kind).toBe('slot');
  });

  it('excludes the other voice when a voice filter is given', () => {
    const doc = mnx(
      {},
      voices(
        [note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q')],
        [note('C5', 'q'), note('D5', 'q'), note('E5', 'q'), note('F5', 'q')],
      ),
    );
    const layout = layoutScore(doc);
    const v1Box = boxes(layout).find((b) => b.voice === 1)!;

    const elementHit = hitTest(layout, center(v1Box), { kinds: ['element'], voice: 0 });
    expect(elementHit).toBeNull();

    const slotHit = hitTest(
      layout,
      { x: v1Box.x + v1Box.w / 2, y: v1Box.y + v1Box.h / 2 },
      { kinds: ['slot'], voice: 0 },
    );
    expect(slotHit?.kind).toBe('slot');
    expect(slotHit && slotHit.kind === 'slot' ? slotHit.slot.voice : null).toBe(0);
  });

  it('reports the note\'s actual written pitch, not a diatonic guess from the key', () => {
    const doc = mnx({ key: 2 }, measure(note('F5', 'q'), rest('q'), rest('q'), rest('q')));
    const layout = layoutScore(doc);
    const box = boxes(layout).find((b) => b.kind === 'note')!;
    const hit = hitTest(layout, center(box), { kinds: ['element'] });
    expect(hit?.kind).toBe('element');
    expect(hit && hit.kind === 'element' ? hit.pitch : null).toEqual({ step: 'F', octave: 5 });

    const chord = (pitches: readonly string[]) => ({
      duration: { base: 'whole' as const },
      notes: pitches.map((p) => ({ pitch: parsePitch(p) })),
    });
    const chordDoc = mnx({ key: 2 }, measure(chord(['C5', 'F#5', 'A5'])));
    const chordLayout = layoutScore(chordDoc);
    const sharp = boxes(chordLayout).find((b) => b.pitch?.step === 3 && b.pitch?.alter === 1)!;
    const chordHit = hitTest(chordLayout, center(sharp), { kinds: ['element'] });
    expect(chordHit?.kind).toBe('element');
    expect(chordHit && chordHit.kind === 'element' ? chordHit.pitch : null).toEqual({
      step: 'F',
      octave: 5,
      alter: 1,
    });
  });

  it('hits an element far outside the ±4sp system band (high and low ledger notes)', () => {
    const highDoc = mnx({}, measure(note('C7', 'q'), rest('q'), rest('q'), rest('q')));
    const highLayout = layoutScore(highDoc);
    const highBox = boxes(highLayout).find((b) => b.kind === 'note')!;
    const highHit = hitTest(highLayout, center(highBox), { kinds: ['element'] });
    expect(highHit?.kind).toBe('element');
    expect(highHit && highHit.kind === 'element' ? highHit.id : null).toBe(highBox.id);

    const lowDoc = mnx({}, measure(note('C2', 'q'), rest('q'), rest('q'), rest('q')));
    const lowLayout = layoutScore(lowDoc);
    const lowBox = boxes(lowLayout).find((b) => b.kind === 'note')!;
    const lowHit = hitTest(lowLayout, center(lowBox), { kinds: ['element'] });
    expect(lowHit?.kind).toBe('element');
    expect(lowHit && lowHit.kind === 'element' ? lowHit.id : null).toBe(lowBox.id);
  });
});

describe('dictation round trip', () => {
  it('re-pitches a rest via a slot hit, keeping the element id stable and every other id untouched', () => {
    const doc = mnx({}, measure(rest('q'), rest('q'), rest('q'), rest('q')));
    const layout1 = layoutScore(doc);
    const system = layout1.systems[0]!;
    const firstSlot = layout1.slots.filter((s) => s.voice === 0).slice().sort((a, b) => a.tick - b.tick)[0]!;

    const hit = hitTest(
      layout1,
      { x: firstSlot.x + firstSlot.w / 2, y: system.y + 2 },
      { kinds: ['slot'] },
    );
    if (!hit || hit.kind !== 'slot') throw new Error('expected a slot hit');
    const { slot, pitch, staffPosition } = hit;
    const beforeId = slot.eventId;

    const result = applyIntent(doc, { type: 'setPitches', event: slot.eventId, pitches: [pitch] });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const layout2 = layoutScore(result.doc);
    const editedBox = layout2.elements[beforeId];
    expect(editedBox).toBeDefined();
    expect(editedBox!.id).toBe(beforeId);
    expect(editedBox!.kind).toBe('note');
    expect(editedBox!.staffPosition).toBeCloseTo(staffPosition, 5);

    for (const id of Object.keys(layout1.elements)) {
      if (id === beforeId) continue;
      expect(layout2.elements[id]).toBeDefined();
      expect(layout2.elements[id]!.id).toBe(id);
    }

    const secondSlot = layout1.slots
      .filter((s) => s.voice === 0 && s.eventId !== beforeId)
      .sort((a, b) => a.tick - b.tick)[0]!;
    const secondPitches = [parsePitch('E4'), parsePitch('G4')];
    const result2 = applyIntent(result.doc, {
      type: 'setPitches',
      event: secondSlot.eventId,
      pitches: secondPitches,
    });
    expect(result2.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const layout3 = layoutScore(result2.doc);
    expect(layout3.elements[beforeId]).toBeDefined();
    expect(layout3.elements[beforeId]!.id).toBe(beforeId);
    expect(layout3.elements[`${secondSlot.eventId}.n0`]).toBeDefined();
    expect(layout3.elements[`${secondSlot.eventId}.n1`]).toBeDefined();
  });
});

describe('previewShapes', () => {
  it('draws ledger lines for a high note and no accidental when it matches the key', () => {
    const doc = mnx({}, measure(rest('w')));
    const layout = layoutScore(doc);
    const measureBox = layout.measures[0]!;

    const { glyphs, rects } = previewShapes(layout, {
      measureIndex: 0,
      x: measureBox.contentX + 1,
      pitch: { step: 'C', octave: 6 },
    });
    expect(glyphs.some((g) => g.cls === 'preview-notehead')).toBe(true);
    expect(rects.filter((r) => r.cls === 'preview-ledger')).toHaveLength(2);
    expect(glyphs.filter((g) => g.cls === 'preview-accidental')).toHaveLength(0);
  });

});

describe('interaction properties', () => {
  const pitchTokenArb = fc
    .record({
      letter: fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G'),
      acc: fc.constantFrom('', '#', 'b'),
      octave: fc.integer({ min: 2, max: 7 }),
    })
    .map(({ letter, acc, octave }) => `${letter}${acc}${octave}`);

  const eventArb = fc.oneof(
    pitchTokenArb.map((pitch) => ({ type: 'note' as const, pitch })),
    fc.constant({ type: 'rest' as const }),
  );

  const measureArb = fc.array(eventArb, { minLength: 4, maxLength: 4 });

  function buildLayout(events: readonly { type: 'note' | 'rest'; pitch?: string }[]) {
    const content = events.map((e) => (e.type === 'note' ? note(e.pitch!, 'q') : rest('q')));
    const doc = mnx({}, measure(...content));
    return { doc, layout: layoutScore(doc) };
  }

  it('keeps every other element id stable after a random setPitches on a random slot', () => {
    fc.assert(
      fc.property(
        measureArb,
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 2 }),
        fc.array(pitchTokenArb, { maxLength: 2 }),
        (events, slotPick, pitchCount, pitchTokens) => {
          const { doc, layout } = buildLayout(events);
          if (layout.slots.length === 0) return;
          const slot = layout.slots[slotPick % layout.slots.length]!;
          const pitches = pitchTokens.slice(0, pitchCount).map((token) => parsePitch(token));
          const beforeIds = Object.keys(layout.elements);

          const result = applyIntent(doc, { type: 'setPitches', event: slot.eventId, pitches });
          const relaid = layoutScore(result.doc);
          const afterIds = new Set(Object.keys(relaid.elements));

          for (const id of beforeIds) {
            if (result.changed.includes(id)) continue;
            expect(afterIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

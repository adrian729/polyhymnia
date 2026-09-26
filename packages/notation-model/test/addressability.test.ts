import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/edit/apply.js';
import { elementIds } from '../src/mnx/element-ids.js';
import { parsePitch } from '../src/mnx/pitch.js';
import type { MnxDocument } from '../src/mnx/types.js';
import { measure, mnx, note } from './support.js';

function documentWithUnaddressable(): MnxDocument {
  const base = mnx(measure(note('C4', 'w', { id: 'addressable' })));
  const firstPart = base.parts[0]!;
  const firstMeasure = firstPart.measures[0]!;
  return {
    ...base,
    parts: [
      {
        ...firstPart,
        measures: [
          {
            ...firstMeasure,
            sequences: [
              { content: [note('C4', 'w', { id: 'voice-a' })] },
              { content: [note('D4', 'w', { id: 'voice-b' })] },
              { content: [note('E4', 'w', { id: 'voice-c' })] },
              { staff: 2, content: [note('F4', 'w', { id: 'staff-two' })] },
            ],
          },
        ],
      },
      { measures: [{ sequences: [{ content: [note('G4', 'w', { id: 'part-two' })] }] }] },
    ],
  };
}

describe('unaddressable events', () => {
  const doc = documentWithUnaddressable();
  const ids = elementIds(doc);

  it('addresses the first two staff-1 sequences of part 0 only', () => {
    expect(ids.nodeOf('voice-a')).toBeDefined();
    expect(ids.nodeOf('voice-b')).toBeDefined();
    expect(ids.idAt({ measureIndex: 0, sequenceIndex: 2, path: [0] })).toBeUndefined();
    expect(ids.idAt({ measureIndex: 0, sequenceIndex: 3, path: [0] })).toBeUndefined();
  });

  it.each(['voice-c', 'staff-two', 'part-two'])('elementIds yields nothing for %s', (id) => {
    expect(ids.nodeOf(id)).toBeUndefined();
  });

  it.each(['voice-c', 'staff-two', 'part-two'])(
    'applyIntent reports intent-target-missing and leaves the document untouched for %s',
    (id) => {
      const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: [parsePitch('A4')] });

      expect(result.doc).toBe(doc);
      expect(result.changed).toEqual([]);
      expect(result.diagnostics.map((d) => d.code)).toEqual(['intent-target-missing']);
    },
  );
});

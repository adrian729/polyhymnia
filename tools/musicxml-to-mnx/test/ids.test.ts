import { describe, expect, it } from 'vitest';
import { assignIds } from '../src/ids.js';

function buildDoc() {
  return {
    mnx: { version: 1 },
    global: { measures: [{}, {}] },
    parts: [
      {
        measures: [
          {
            sequences: [
              {
                content: [
                  { duration: { base: 'quarter' }, notes: [{ pitch: { step: 'C', octave: 4 } }] },
                  {
                    id: 'kept',
                    duration: { base: 'quarter' },
                    notes: [{ pitch: { step: 'D', octave: 4 } }],
                  },
                  {
                    duration: { base: 'quarter' },
                    notes: [{ pitch: { step: 'E', octave: 4 } }, { pitch: { step: 'G', octave: 4 } }],
                  },
                  { duration: { base: 'quarter' }, rest: {} },
                ],
              },
            ],
          },
          {
            sequences: [
              {
                content: [{ duration: { base: 'whole' }, notes: [{ pitch: { step: 'C', octave: 5 } }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('assignIds', () => {
  it('assigns positional ids to events lacking one, and leaves existing ids alone', () => {
    const doc = assignIds(buildDoc()) as any;
    const events = doc.parts[0].measures[0].sequences[0].content;
    expect(events[0].id).toBe('e0-0');
    expect(events[1].id).toBe('kept');
    expect(events[2].id).toBe('e0-2');
    expect(events[3].id).toBe('e0-3');
    expect(doc.parts[0].measures[1].sequences[0].content[0].id).toBe('e1-0');
  });

  it('assigns ids to chord notes derived from the event id', () => {
    const doc = assignIds(buildDoc()) as any;
    const chord = doc.parts[0].measures[0].sequences[0].content[2];
    expect(chord.notes[0].id).toBe(`${chord.id}-n0`);
    expect(chord.notes[1].id).toBe(`${chord.id}-n1`);
  });

  it('is deterministic across separate runs on equivalent input', () => {
    const a = assignIds(buildDoc());
    const b = assignIds(buildDoc());
    expect(a).toEqual(b);
  });

  it('does not reassign or collide when run again on already-id-ed content', () => {
    const once = assignIds(buildDoc());
    const twice = assignIds(once);
    expect(twice).toEqual(once);
  });
});

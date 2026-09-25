import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check.js';
import { convert } from '../src/convert.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

const MINIMAL_VALID_DOC = {
  mnx: { version: 1 },
  global: {
    measures: [{ time: { count: 4, unit: 4 } }],
  },
  parts: [
    {
      measures: [
        {
          clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
          sequences: [
            {
              content: [{ duration: { base: 'whole' }, notes: [{ pitch: { step: 'C', octave: 4 } }] }],
            },
          ],
        },
      ],
    },
  ],
};

const DOC_WITH_BEAMS = {
  mnx: { version: 1 },
  global: {
    measures: [{ time: { count: 4, unit: 4 } }],
  },
  parts: [
    {
      measures: [
        {
          beams: [{ events: ['ev1', 'ev2'] }],
          clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
          sequences: [
            {
              content: [
                {
                  id: 'ev1',
                  duration: { base: 'eighth' },
                  notes: [{ pitch: { step: 'C', octave: 5 } }],
                },
                {
                  id: 'ev2',
                  duration: { base: 'eighth' },
                  notes: [{ pitch: { step: 'D', octave: 5 } }],
                },
                { duration: { base: 'half' }, rest: {} },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('check', () => {
  it('passes a schema-valid, fully-supported document', () => {
    const result = check(MINIMAL_VALID_DOC);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.layout).not.toBeNull();
  });

  it('fails on a schema-invalid document', () => {
    const result = check({ not: 'an mnx document' });
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.every((p) => p.kind === 'schema')).toBe(true);
  });

  it('fails on an unsupported construct outside the allowlist', () => {
    const xml = readFileSync(`${FIXTURES}simple-repeat.musicxml`, 'utf8');
    const doc = convert(xml);
    const result = check(doc);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /mnx-unsupported/.test(p.message))).toBe(true);
  });

  it('lays out explicit beams with no mnx-unsupported diagnostic (empty allowlist)', () => {
    const result = check(DOC_WITH_BEAMS);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'mnx-unsupported')).toBe(false);
  });
});

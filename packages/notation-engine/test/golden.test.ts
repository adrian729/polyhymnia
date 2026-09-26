import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { layoutScore } from '../src/layout/index.js';
import type { LayoutResult } from '../src/layout/types.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../notation-model/schema/examples/', import.meta.url));

const fixtureNames = [
  'breath',
  'chrome-changes',
  'golden-accidentals-stacking',
  'golden-beams-16ths',
  'golden-beams-6-8-vs-3-4',
  'golden-beams-chords',
  'golden-beams-hooks-dotted',
  'golden-beams-over-rest',
  'golden-beams-slope',
  'golden-beams-stem-override',
  'golden-rests-3-4',
  'golden-slurs',
  'golden-ties-barline',
  'golden-ties-chord',
  'golden-ties-system-break',
  'golden-tuplets',
  'golden-two-voices',
  'inheritance',
  'mapping',
  'pickup',
  'repeat-alto',
  'system-break',
  'tempo',
];

const SELECTED_EXAMPLES = ['beams-secondary-beam-breaks'];

function loadFixture(name: string): MnxDocument {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8')) as MnxDocument;
}

function loadExample(name: string): MnxDocument {
  return JSON.parse(readFileSync(`${EXAMPLES}${name}.json`, 'utf8')) as MnxDocument;
}

function round(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(round);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]));
  }
  return value;
}

function golden(layout: LayoutResult): string {
  const { timemap, ...rest } = layout;
  const serializable = {
    ...rest,
    timemap: {
      divisions: timemap.divisions,
      entries: timemap.entries,
      measures: timemap.measures,
      tempo: timemap.tempo,
    },
  };
  return `${JSON.stringify(round(serializable), null, 2)}\n`;
}

describe('golden fixtures', () => {
  it('found golden fixtures to check', () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });

  it.each(fixtureNames)('%s', async (name) => {
    const layout = layoutScore(loadFixture(name));
    await expect(golden(layout)).toMatchFileSnapshot(`__golden__/${name}.json`);
  });
});

describe('golden official examples', () => {
  it.each(SELECTED_EXAMPLES)('%s', async (name) => {
    const layout = layoutScore(loadExample(name));
    await expect(golden(layout)).toMatchFileSnapshot(`__golden__/example-${name}.json`);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { layoutScore } from '../src/layout/index.js';
import type { LayoutResult } from '../src/layout/types.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../notation-model/schema/examples/', import.meta.url));

const fixtureNames = readdirSync(FIXTURES)
  .filter((f) => /^golden-.*\.json$/.test(f))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

const SELECTED_EXAMPLES = [
  'tuplets',
  'key-signatures',
  'dotted-notes',
  'beams',
  'beam-hooks',
  'beams-secondary-beam-breaks',
  'beams-secondary-beam-breaks-implied',
  'ties',
];

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

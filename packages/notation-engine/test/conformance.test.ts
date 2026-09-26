import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { layoutScore } from '../src/layout/index.js';

const EXAMPLES = fileURLToPath(new URL('../../notation-model/schema/examples/', import.meta.url));
const examples = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

const WITHOUT_MEASURES = new Set(['orchestral-layout']);

function load(name: string): MnxDocument {
  return JSON.parse(readFileSync(`${EXAMPLES}${name}.json`, 'utf8')) as MnxDocument;
}

describe('official MNX examples lay out without throwing', () => {
  it('every vendored example lays out without error diagnostics', () => {
    expect(examples.length).toBeGreaterThan(0);
    for (const name of examples) {
      const layout = layoutScore(load(name));
      expect(layout.diagnostics.filter((d) => d.severity === 'error'), name).toEqual([]);
      if (WITHOUT_MEASURES.has(name)) expect(layout.systems, name).toEqual([]);
      else expect(layout.systems.length, name).toBeGreaterThan(0);
    }
  });
});

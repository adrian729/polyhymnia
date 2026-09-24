import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convert } from '../src/convert.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

describe('convert', () => {
  it('converts a basic MusicXML file to an MNX-shaped document', () => {
    const xml = readFileSync(`${FIXTURES}basic.musicxml`, 'utf8');
    const doc = convert(xml) as { mnx?: { version?: number }; parts?: unknown[] };
    expect(doc.mnx?.version).toBe(1);
    expect(Array.isArray(doc.parts)).toBe(true);
  });
});

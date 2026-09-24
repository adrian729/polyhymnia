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

const EXPECTED_CODES: Record<string, readonly string[]> = {
  'accidentals': [],
  'articulations': ['mnx-unsupported'],
  'beam-hooks': ['mnx-unsupported'],
  'beams-across-barlines': ['mnx-unsupported'],
  'beams-inner-grace-notes': ['mnx-unsupported'],
  'beams-secondary-beam-breaks-implied': ['mnx-unsupported'],
  'beams-secondary-beam-breaks': ['mnx-unsupported'],
  'beams': ['mnx-unsupported'],
  'clef-changes': ['mnx-unsupported'],
  'dotted-notes': [],
  'dynamics-accents': ['mnx-unsupported'],
  'dynamics': ['mnx-unsupported'],
  'full-measure-rests': [],
  'grace-note': ['mnx-unsupported'],
  'grace-notes-beamed': ['mnx-unsupported'],
  'grand-staff': ['mnx-unsupported'],
  'hello-world': [],
  'jumps-dal-segno': ['mnx-unsupported'],
  'jumps-ds-al-fine': ['mnx-unsupported'],
  'key-signatures': [],
  'lyric-line-metadata': ['mnx-unsupported'],
  'lyrics-basic': ['mnx-unsupported'],
  'lyrics-multi-line': ['mnx-unsupported'],
  'measure-repeats-counter': ['measure-underfull', 'mnx-unsupported'],
  'measure-repeats': ['measure-underfull', 'mnx-unsupported'],
  'multi-note-tremolos': ['mnx-unsupported'],
  'multimeasure-rests': ['mnx-unsupported'],
  'multiple-layouts': ['mnx-unsupported'],
  'multiple-voices': ['voice-1-not-yet-supported'],
  'orchestral-layout': ['mnx-unsupported', 'no-measures', 'system-measure-unresolved'],
  'organ-layout': ['mnx-unsupported', 'system-measure-unresolved', 'voice-1-not-yet-supported'],
  'ottavas-8va': ['mnx-unsupported'],
  'parts': ['mnx-unsupported'],
  'repeats-alternate-endings-advanced': ['mnx-unsupported'],
  'repeats-alternate-endings-simple': ['mnx-unsupported'],
  'repeats-implied-start-repeat': [],
  'repeats-more-once-repeated': ['mnx-unsupported'],
  'repeats': [],
  'rest-positions': ['voice-1-not-yet-supported'],
  'single-note-tremolos': ['mnx-unsupported'],
  'slurs-chords': ['mnx-unsupported'],
  'slurs-targeting-specific-notes': ['mnx-unsupported'],
  'slurs': ['mnx-unsupported'],
  'system-layouts': ['measure-count-mismatch', 'mnx-unsupported'],
  'tempo-markings': [],
  'three-note-chord-and-half-rest': [],
  'tie-target-type': ['mnx-unsupported', 'voice-1-not-yet-supported'],
  'ties': [],
  'time-signature-glyphs': [],
  'time-signatures': [],
  'tuplets': ['mnx-unsupported'],
  'two-bar-c-major-scale': [],
};

const WITHOUT_MEASURES = new Set(['orchestral-layout']);

function load(name: string): MnxDocument {
  return JSON.parse(readFileSync(`${EXAMPLES}${name}.json`, 'utf8')) as MnxDocument;
}

describe('official MNX examples lay out without throwing', () => {
  it('covers every vendored example', () => {
    expect(examples).toEqual(Object.keys(EXPECTED_CODES).sort());
  });

  it.each(examples)('%s', (name) => {
    const layout = layoutScore(load(name));
    const codes = [...new Set(layout.diagnostics.map((d) => d.code))].sort();

    expect(codes).toEqual(EXPECTED_CODES[name]);
    expect(layout.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    if (WITHOUT_MEASURES.has(name)) expect(layout.systems).toEqual([]);
    else expect(layout.systems.length).toBeGreaterThan(0);
    expect(
      layout.diagnostics.filter((d) => d.code === 'mnx-unsupported').map((d) => d.message),
    ).toMatchSnapshot();
  });
});

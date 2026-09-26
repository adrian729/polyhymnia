import { describe, expect, it } from 'vitest';
import { layoutScore } from '../src/layout/index.js';
import { GLYPH_CODEPOINT } from '../src/font/glyphs.js';
import { ALTO, BASS, TENOR, TREBLE, measure, mnx, rest } from './mnx.js';

type ClefName = 'treble' | 'bass' | 'alto' | 'tenor';

const CLEFS = { treble: TREBLE, bass: BASS, alto: ALTO, tenor: TENOR } as const;

const SHARP_POSITIONS: Record<ClefName, readonly number[]> = {
  treble: [8, 5, 9, 6, 3, 7, 4],
  bass: [6, 3, 7, 4, 1, 5, 2],
  alto: [7, 4, 8, 5, 2, 6, 3],
  tenor: [2, 6, 3, 7, 4, 8, 5],
};

const FLAT_POSITIONS: Record<ClefName, readonly number[]> = {
  treble: [4, 7, 3, 6, 2, 5, 1],
  bass: [2, 5, 1, 4, 0, 3, -1],
  alto: [3, 6, 2, 5, 1, 4, 0],
  tenor: [5, 8, 4, 7, 3, 6, 2],
};

const KEYS = [-7, -3, -1, 2, 7];

describe('key signatures across every major key and clef', () => {
  for (const clefName of Object.keys(CLEFS) as ClefName[]) {
    describe(clefName, () => {
      it.each(KEYS)('fifths %i places accidentals on the conventional staff positions', (fifths) => {
        const layout = layoutScore(mnx({ key: fifths, clef: CLEFS[clefName] }, measure(rest('w'))));
        const table = fifths > 0 ? SHARP_POSITIONS[clefName] : FLAT_POSITIONS[clefName];
        const glyph = GLYPH_CODEPOINT[fifths > 0 ? 'accidentalSharp' : 'accidentalFlat']!;
        const top = layout.systems[0]!.y;
        const drawn = layout.glyphs
          .filter((g) => g.cls === 'key-accidental')
          .sort((a, b) => a.x - b.x);

        expect(drawn.map((g) => g.cp)).toEqual(Array(Math.abs(fifths)).fill(glyph));
        expect(drawn.map((g) => +(g.y - top).toFixed(3))).toEqual(
          table.slice(0, Math.abs(fifths)).map((p) => (8 - p) / 2),
        );
        expect(layout.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      });
    });
  }
});

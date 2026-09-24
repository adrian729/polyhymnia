import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { GLYPH_CODEPOINT } from '../src/font/glyphs.js';
import { layoutScore } from '../src/layout/index.js';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import {
  TREBLE,
  chord,
  fixture,
  measure,
  mnx,
  note,
  rest,
  tuplet,
  withGlobal,
  withPart,
} from './mnx.js';

const cp = (name: string): number => GLYPH_CODEPOINT[name]!;

function unsupported(doc: MnxDocument): string[] {
  return layoutScore(doc)
    .diagnostics.filter((d) => d.code === 'mnx-unsupported')
    .map((d) => d.message);
}

describe('ids', () => {
  it('uses MNX ids when present and positional ids otherwise', () => {
    const doc = mnx(
      {},
      measure(
        note('C4', 'q', { id: 'ev-a' }),
        note('D4', 'q', {}, { id: 'note-b' }),
        chord(['E4', 'G4'], 'q'),
        tuplet([3, '8'], [2, '8'], note('F4', '8'), note('G4', '8'), note('A4', '8')),
      ),
      measure(note('C4', 'h')),
    );
    const map = temporal(normalize(doc));

    expect(map.elements.map((e) => e.id)).toEqual([
      'ev-a',
      'm0.s0.e1',
      'm0.s0.e2',
      'm0.s0.e3',
      'm0.s0.e4',
      'm0.s0.e5',
      'm1.s0.e0',
      'm1.v0.pad0',
    ]);
    expect(map.elements.map((e) => e.notes.map((n) => n.id))).toEqual([
      ['ev-a'],
      ['note-b'],
      ['m0.s0.e2.n0', 'm0.s0.e2.n1'],
      ['m0.s0.e3'],
      ['m0.s0.e4'],
      ['m0.s0.e5'],
      ['m1.s0.e0'],
      [],
    ]);
    expect(map.elements[3]!.tuplet?.id).toBe('m0.s0.t0');
  });

  it('keys ElementBoxes by note id and a full-measure rest by its positional id', () => {
    const layout = layoutScore(
      mnx({}, measure(note('C4', 'w', {}, { id: 'n-c' })), { sequences: [{ content: [], fullMeasure: {} }] }),
    );
    expect(Object.keys(layout.elements).sort()).toEqual(['m1.s0.full', 'n-c']);
  });
});

describe('ties', () => {
  it('resolves note.ties[].target into start, continue and stop', () => {
    const map = temporal(normalize(fixture('mapping')));
    const ties = map.elements.flatMap((e) => e.notes.map((n) => [n.id, n.tie ?? null]));

    expect(ties.slice(0, 3)).toEqual([
      ['n1', 'start'],
      ['n2', 'continue'],
      ['n3', 'stop'],
    ]);
    const entry = layoutScore(fixture('mapping')).timemap.byId('n1')!;
    expect(entry.durationTicks).toBe(3 * 3360);
  });

  it('diagnoses a tie whose target is not a laid-out note', () => {
    const doc = mnx({}, measure(note('C4', 'w', {}, { ties: [{ target: 'nowhere' }] })));
    const diagnostics = layoutScore(doc).diagnostics;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'tie-target-unresolved', measureIndex: 0 }),
    );
    expect(temporal(normalize(doc)).elements[0]!.notes[0]!.tie).toBeUndefined();
  });

  it('reports a laissez-vibrer tie as unsupported', () => {
    expect(unsupported(mnx({}, measure(note('C4', 'w', {}, { ties: [{ lv: true }] }))))).toEqual([
      'Unsupported MNX: laissez-vibrer tie in measure 0; not drawn.',
    ]);
  });

  it('only draws a tie whose targetType is nextNote or absent', () => {
    const doc = mnx(
      {},
      measure(
        note('C4', 'q', {}, { id: 'a', ties: [{ target: 'b', targetType: 'crossVoice' }] }),
        note('D4', 'q', {}, { id: 'b' }),
        note('E4', 'q', {}, { id: 'c', ties: [{ target: 'd', targetType: 'nextNote' }] }),
        note('F4', 'q', {}, { id: 'd' }),
      ),
    );
    const map = temporal(normalize(doc));
    const tieOf = (id: string) => map.elements.flatMap((e) => e.notes).find((n) => n.id === id)!.tie;

    expect(tieOf('a')).toBeUndefined();
    expect(tieOf('b')).toBeUndefined();
    expect(tieOf('c')).toBe('start');
    expect(tieOf('d')).toBe('stop');
    expect(unsupported(doc)).toEqual(['Unsupported MNX: tie with targetType crossVoice in measure 0; not drawn.']);
  });
});

describe('clefs', () => {
  it('maps sign and staffPosition onto treble, bass, alto and tenor', () => {
    const kindOf = (sign: 'G' | 'F' | 'C', staffPosition: number) =>
      normalize(mnx({ clef: { sign, staffPosition } }, measure(note('C4', 'w')))).staves[0]!.measures[0]!.clef;

    expect(kindOf('G', -2)).toEqual({ kind: 'treble' });
    expect(kindOf('F', 2)).toEqual({ kind: 'bass' });
    expect(kindOf('C', 0)).toEqual({ kind: 'alto' });
    expect(kindOf('C', 2)).toEqual({ kind: 'tenor' });
  });

  it('maps clef octave -1/+1 onto the octave clef glyphs', () => {
    const glyph = (octave: -1 | 1) =>
      layoutScore(mnx({ clef: { ...TREBLE, octave } }, measure(note('C4', 'w')))).glyphs.find(
        (g) => g.cls === 'clef',
      )!.cp;
    expect(glyph(-1)).toBe(cp('gClef8vb'));
    expect(glyph(1)).toBe(cp('gClef8va'));
  });

  it('draws an unsupported clef position with the nearest supported clef', () => {
    const doc = mnx({ clef: { sign: 'G', staffPosition: -4 } }, measure(note('C4', 'w')));
    expect(normalize(doc).staves[0]!.measures[0]!.clef).toEqual({ kind: 'treble' });
    expect(unsupported(doc)).toEqual([
      'Unsupported MNX: G clef on staff position -4 in measure 0; drawn as a treble clef.',
    ]);
  });

  it('keeps the previous clef for a percussion clef', () => {
    const doc = mnx(
      {},
      measure(note('C4', 'w')),
      withPart({ clefs: [{ clef: { sign: 'P', staffPosition: 0 } }] }, measure(note('C4', 'w'))),
    );
    expect(normalize(doc).staves[0]!.measures[1]!.clef).toEqual({ kind: 'treble' });
    expect(unsupported(doc)).toEqual(['Unsupported MNX: percussion clef in measure 1; the previous clef is kept.']);
  });

  it('applies a mid-measure clef from the next measure', () => {
    const doc = mnx(
      {},
      withPart(
        { clefs: [{ clef: TREBLE }, { clef: { sign: 'F', staffPosition: 2 }, position: { fraction: [1, 2] } }] },
        measure(note('C4', 'h'), note('C3', 'h')),
      ),
      measure(note('C3', 'w')),
    );
    expect(normalize(doc).staves[0]!.measures.map((m) => m.clef.kind)).toEqual(['treble', 'bass']);
    expect(unsupported(doc)).toEqual([
      'Unsupported MNX: mid-measure clef in measure 0; applied from the next measure.',
    ]);
  });
});

describe('global measure properties', () => {
  it('maps barline types, repeats and time display', () => {
    const doc = mnx(
      { time: { count: 4, unit: 4, display: 'common' } },
      withGlobal({ repeatStart: {}, barline: { type: 'double' } }, measure(note('C4', 'w'))),
      withGlobal({ time: { count: 2, unit: 2, display: 'cut' }, repeatEnd: {} }, measure(note('C4', 'w'))),
      withGlobal({ barline: { type: 'noBarline' } }, measure(note('C4', 'w'))),
      withGlobal({ barline: { type: 'heavy' } }, measure(note('C4', 'w'))),
    );
    const measures = normalize(doc).staves[0]!.measures;

    expect(measures.map((m) => [m.barlineStart ?? null, m.barlineEnd ?? null])).toEqual([
      ['repeat-start', 'double'],
      [null, 'repeat-end'],
      [null, 'none'],
      [null, 'single'],
    ]);
    expect(measures.map((m) => m.time.symbol ?? null)).toEqual(['common', 'cut', 'cut', 'cut']);
    expect(unsupported(doc)).toEqual(['Unsupported MNX: heavy barline in measure 3; drawn as a single barline.']);
  });

  it('places tempo changes at their location with a dotted beat unit', () => {
    const normalized = normalize(fixture('mapping'));
    expect(normalized.tempo).toEqual([{ tick: 6720, bpm: 90, beatUnit: { base: 'quarter', dots: 1 } }]);

    const tm = layoutScore(fixture('mapping')).timemap;
    expect(tm.tickToSeconds(6720)).toBeCloseTo(1, 6);
    expect(tm.tickToSeconds(6720 + 5040)).toBeCloseTo(1 + 60 / 90, 6);
  });

  it('breaks systems where the score layout starts them, and diagnoses unknown measures', () => {
    const doc = {
      ...fixture('system-break'),
      scores: [{ name: 'x', pages: [{ systems: [{ measure: 'm1' }, { measure: 'm9' }] }] }],
    };
    const layout = layoutScore(doc);
    expect(layout.systems).toHaveLength(1);
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['system-measure-unresolved']);
  });
});

describe('events and notes', () => {
  it('maps accidentalDisplay onto always, never and cautionary', () => {
    const doc = mnx(
      {},
      measure(
        note('F4', 'q', {}, { accidentalDisplay: { show: true } }),
        note('F#4', 'q', {}, { accidentalDisplay: { show: false } }),
        note('G#4', 'q', {}, { accidentalDisplay: { show: true, enclosure: { symbol: 'parentheses' } } }),
        note('G#4', 'q', {}, { accidentalDisplay: { show: true, enclosure: { symbol: 'parentheses' } } }),
      ),
    );
    const policies = temporal(normalize(doc)).elements.map((e) => e.notes[0]!.accidentalPolicy);
    expect(policies).toEqual(['always', 'never', 'cautionary', 'cautionary']);

    const glyphs = layoutScore(doc, { accidentals: { parenthesizeCautionary: true } }).glyphs.filter(
      (g) => g.cls === 'accidental',
    );
    expect(glyphs.map((g) => g.cp)).toEqual([
      cp('accidentalNatural'),
      cp('accidentalParensLeft'),
      cp('accidentalParensRight'),
      cp('accidentalSharp'),
      cp('accidentalParensLeft'),
      cp('accidentalParensRight'),
      cp('accidentalSharp'),
    ]);
  });

  it('converts a rest staffPosition from MNX half-spaces to staff y', () => {
    const layout = layoutScore(fixture('mapping'));
    const restBox = Object.values(layout.elements).find((b) => b.kind === 'rest')!;
    expect(restBox.staffPosition).toBe(1);
  });

  it('carries stemDirection through as a stem override', () => {
    const stems = temporal(normalize(fixture('mapping'))).elements.map((e) => e.stem ?? null);
    expect(stems.slice(0, 3)).toEqual([null, 'up', null]);
  });

  it('draws markings.breath as a comma and markings.caesura as a caesura', () => {
    const cps = (markings: object) =>
      layoutScore(mnx({}, measure(note('C4', 'h', { markings }), note('D4', 'h'))))
        .glyphs.filter((g) => g.cls === 'breath')
        .map((g) => g.cp);
    expect(cps({ breath: {} })).toEqual([cp('breathMarkComma')]);
    expect(cps({ caesura: {} })).toEqual([cp('caesura')]);
  });

  it('advances time invisibly over a space', () => {
    const doc = mnx({}, measure(note('C4', 'q'), { type: 'space', duration: [1, 4] }, note('E4', 'h')));
    const map = temporal(normalize(doc));
    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([
      [0, 3360],
      [6720, 6720],
    ]);
    expect(layoutScore(doc).diagnostics).toEqual([]);
  });
});

describe('unsupported constructs render what they can and say so', () => {
  it('skips grace notes', () => {
    const doc = mnx({}, measure({ type: 'grace', content: [note('B4', '8')] }, note('C5', 'w')));
    expect(temporal(normalize(doc)).elements.map((e) => e.id)).toEqual(['m0.s0.e1']);
    expect(unsupported(doc)).toEqual(['Unsupported MNX: grace notes in measure 0; not drawn.']);
  });

  it('lays out only the first part and staff 1', () => {
    const doc = mnx({}, {
      sequences: [
        { content: [note('C5', 'w')] },
        { staff: 2, content: [note('C3', 'w')] },
      ],
    });
    const twoParts: MnxDocument = { ...doc, parts: [...doc.parts, doc.parts[0]!] };
    const layout = layoutScore(twoParts);

    expect(Object.keys(layout.elements)).toEqual(['m0.s0.e0']);
    expect(layout.diagnostics.map((d) => d.message)).toEqual([
      'Unsupported MNX: 2 parts; only the first part is laid out.',
      'Unsupported MNX: sequence on staff 2 in measure 0; not laid out.',
    ]);
  });

  it('skips note values outside breve..64th and clamps dots to two', () => {
    const doc = mnx(
      {},
      measure(
        { duration: { base: '128th' }, notes: [{ pitch: { step: 'C', octave: 4 } }] },
        { duration: { base: 'half', dots: 3 }, notes: [{ pitch: { step: 'D', octave: 4 } }] },
        rest('16'),
      ),
    );
    const map = temporal(normalize(doc));
    expect(map.elements[0]!.dots).toBe(2);
    expect(map.elements[0]!.durationTicks).toBe((13440 * 15) / 16);
    expect(map.diagnostics).toEqual([]);
    expect(unsupported(doc)).toEqual([
      'Unsupported MNX: 128th note value in measure 0; the event is skipped.',
      'Unsupported MNX: 3 dots in measure 0; two dots are drawn.',
    ]);
  });

  it('reports each unsupported construct once per measure, never throwing', () => {
    const doc = mnx(
      {},
      withPart(
        { dynamics: [{ type: 'immediate', value: 'f', position: { fraction: [0, 1] } }] },
        measure(
          note('C4', 'q', { slurs: [{ target: 'x' }], markings: { staccato: {} } }),
          note('D4', 'q', { slurs: [{ target: 'x' }] }),
          note('E4', 'h', { lyrics: { lines: { '1': { text: 'la' } } } }),
        ),
      ),
    );
    expect(() => layoutScore(doc)).not.toThrow();
    expect(unsupported(doc)).toEqual([
      'Unsupported MNX: dynamics in measure 0; not drawn.',
      'Unsupported MNX: slurs in measure 0; not drawn.',
      'Unsupported MNX: staccato marking in measure 0; not drawn.',
      'Unsupported MNX: lyrics in measure 0; not drawn.',
    ]);
  });
});

describe('id collisions', () => {
  it('disambiguates a positional id that collides with an explicit id used elsewhere', () => {
    const doc = mnx(
      {},
      measure(note('C4', 'q', { id: 'm0.s0.e1' }), note('D4', 'q'), note('E4', 'q')),
    );
    const map = temporal(normalize(doc));

    expect(map.elements.map((e) => e.id)).toEqual(['m0.s0.e1', 'm0.s0.e1~2', 'm0.s0.e2']);
    const collisions = layoutScore(doc).diagnostics.filter((d) => d.code === 'id-collision');
    expect(collisions).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'id-collision',
        measureIndex: 0,
        message: 'Synthesized id "m0.s0.e1" collides with an existing id; using "m0.s0.e1~2" instead.',
      }),
    ]);
  });

  it('reports a warning when two elements explicitly share the same id', () => {
    const doc = mnx(
      {},
      measure(note('C4', 'q', { id: 'dup' }), note('D4', 'q', { id: 'dup' })),
    );
    const diagnostics = layoutScore(doc).diagnostics;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'id-collision', measureIndex: 0 }),
    );
  });
});

describe('nested tuplets', () => {
  it('flattens a triplet nested inside a 5:4 quintuplet, combining the ratios', () => {
    const doc = mnx(
      {},
      measure(
        tuplet(
          [5, '8'],
          [4, '8'],
          note('C4', '8'),
          note('D4', '8'),
          tuplet([3, '8'], [2, '8'], note('E4', '8'), note('F4', '8'), note('G4', '8')),
        ),
      ),
    );
    const map = temporal(normalize(doc));
    const [outer1, outer2, inner1, inner2, inner3] = map.elements;

    expect(outer1!.tuplet).toEqual({ id: 'm0.s0.t0', actual: 5, normal: 4 });
    expect(outer1!.durationTicks).toBe(1344);
    expect(outer2!.tuplet).toEqual({ id: 'm0.s0.t0', actual: 5, normal: 4 });
    expect(outer2!.durationTicks).toBe(1344);

    expect(inner1!.tuplet).toEqual({ id: 'm0.s0.t1', actual: 15, normal: 8 });
    expect(inner1!.durationTicks).toBe(896);
    expect(inner2!.durationTicks).toBe(896);
    expect(inner3!.durationTicks).toBe(896);

    expect(unsupported(doc)).toContainEqual(
      'Unsupported MNX: nested tuplet in measure 0; flattened into one tuplet.',
    );
  });

  it('combines the ratios for two levels of 3:2 nesting', () => {
    const doc = mnx(
      {},
      measure(
        tuplet(
          [3, 'q'],
          [2, 'q'],
          note('C4', 'q'),
          tuplet([3, 'q'], [2, 'q'], note('D4', 'q'), note('E4', 'q'), note('F4', 'q')),
        ),
      ),
    );
    const map = temporal(normalize(doc, { divisions: 36 }));
    const [outer, inner1, inner2, inner3] = map.elements;

    expect(outer!.tuplet).toEqual({ id: 'm0.s0.t0', actual: 3, normal: 2 });
    expect(outer!.durationTicks).toBe(24);

    expect(inner1!.tuplet).toEqual({ id: 'm0.s0.t1', actual: 9, normal: 4 });
    expect(inner1!.durationTicks).toBe(16);
    expect(inner2!.durationTicks).toBe(16);
    expect(inner3!.durationTicks).toBe(16);

    expect(unsupported(doc)).toContainEqual(
      'Unsupported MNX: nested tuplet in measure 0; flattened into one tuplet.',
    );
  });

  it("says nested content keeps only the outer tuplet's ratio when the inner ratio is unsupported", () => {
    const doc = mnx(
      {},
      measure(
        tuplet(
          [3, '8'],
          [2, '8'],
          note('C4', '8'),
          { type: 'tuplet', inner: { multiple: 3, duration: { base: '128th' as never } }, outer: { multiple: 2, duration: { base: '128th' as never } }, content: [note('D4', '8'), note('E4', '8')] } as never,
        ),
      ),
    );
    expect(unsupported(doc)).toContainEqual(
      "Unsupported MNX: tuplet with an unsupported note value in measure 0; its content keeps only the outer tuplet's ratio.",
    );
  });
});

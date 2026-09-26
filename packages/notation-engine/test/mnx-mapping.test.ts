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
  voices,
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

  it('gives a shared event object distinct ids at each of its layout positions', () => {
    const shared = note('C4', 'q');
    const doc = mnx({}, measure(shared, shared));
    const map = temporal(normalize(doc));
    expect(map.elements.map((e) => e.id)).toEqual(['m0.s0.e0', 'm0.s0.e1']);
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

  it('breaks systems where the score layout starts them, and diagnoses unknown measures', () => {
    const doc = {
      ...fixture('system-break'),
      scores: [{ name: 'x', pages: [{ systems: [{ measure: 'm1' }, { measure: 'm9' }] }] }],
    };
    const layout = layoutScore(doc);
    expect(layout.systems).toHaveLength(1);
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['mnx-unsupported', 'system-measure-unresolved']);
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

describe('beams', () => {
  function useBeamsTrue(doc: MnxDocument): MnxDocument {
    return { ...doc, mnx: { ...doc.mnx, support: { ...doc.mnx.support, useBeams: true } } };
  }

  it('reads an explicit primary beam group, dropping any element not referenced', () => {
    const doc = mnx(
      {},
      withPart(
        { beams: [{ events: ['a', 'b'] }] },
        measure(
          note('C4', '8', { id: 'a' }),
          note('D4', '8', { id: 'b' }),
          note('E4', 'q'),
          note('F4', 'q'),
        ),
      ),
    );
    const beams = normalize(doc).beams;
    expect(beams).toHaveLength(1);
    expect(beams[0]).toMatchObject({ measureIndex: 0, voice: 0, elements: ['a', 'b'] });
    expect(beams[0]!.id).toBe('a.beam');
  });

  it('reads explicit nested beams into levels and hook directions', () => {
    const doc = mnx(
      {},
      withPart(
        {
          beams: [
            {
              events: ['a', 'b', 'c'],
              beams: [{ events: ['a'], direction: 'right' }, { events: ['c'], direction: 'left' }],
            },
          ],
        },
        measure(note('C5', '16', { id: 'a' }), note('D5', '8', { id: 'b' }), note('E5', '16', { id: 'c' })),
      ),
    );
    const beam = normalize(doc).beams[0]!;
    expect(beam.segments).toEqual([
      { level: 2, first: 'a', last: 'a', hook: 'right' },
      { level: 2, first: 'c', last: 'c', hook: 'left' },
    ]);
  });

  it('derives implied secondary segments and hooks from durations when nested beams are absent', () => {
    const doc = mnx(
      {},
      withPart(
        { beams: [{ events: ['a', 'b'] }] },
        measure(note('C5', '8.', { id: 'a' }), note('D5', '16', { id: 'b' }), note('E5', 'h')),
      ),
    );
    const beam = normalize(doc).beams[0]!;
    expect(beam.segments).toEqual([{ level: 2, first: 'b', last: 'b', hook: 'left' }]);
  });

  it('derives a mid-group hook direction from the note onset, not its index parity', () => {
    const doc = mnx(
      {},
      withPart(
        { beams: [{ events: ['a', 'b', 'c', 'd'] }] },
        measure(
          note('C5', '8.', { id: 'a' }),
          note('D5', '8', { id: 'b' }),
          note('E5', '16', { id: 'c' }),
          note('F5', '8', { id: 'd' }),
        ),
      ),
    );
    const beam = normalize(doc).beams[0]!;
    expect(beam.segments).toEqual([{ level: 2, first: 'c', last: 'c', hook: 'left' }]);
  });

  it('auto-beams a measure with no explicit beams and support.useBeams unset', () => {
    const doc = mnx(
      {},
      measure(
        note('C5', '8', { id: 'a' }),
        note('D5', '8', { id: 'b' }),
        note('E5', '8', { id: 'c' }),
        note('F5', '8', { id: 'd' }),
        note('C5', '8', { id: 'e' }),
        note('D5', '8', { id: 'f' }),
        note('E5', '8', { id: 'g' }),
        note('F5', '8', { id: 'h' }),
      ),
    );
    const beams = normalize(doc).beams;
    expect(beams.map((b) => b.elements)).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
  });

  it('drops a beam referencing an unknown id, with a beam-invalid diagnostic', () => {
    const doc = mnx(
      {},
      withPart(
        { beams: [{ events: ['nope', 'also-nope'] }] },
        measure(note('C5', '8'), note('D5', '8'), note('E5', 'q'), note('F5', 'q')),
      ),
    );
    const normalized = normalize(doc);
    expect(normalized.beams).toEqual([]);
    expect(normalized.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'beam-invalid', measureIndex: 0 }),
    );
  });

  it('drops a beam that references events in two different measures', () => {
    const doc = mnx(
      {},
      withPart({ beams: [{ events: ['a', 'b'] }] }, measure(note('C5', '8', { id: 'a' }), rest('8'), rest('h'))),
      measure(note('D5', '8', { id: 'b' }), rest('8'), rest('h')),
    );
    const normalized = normalize(doc);
    expect(normalized.beams).toEqual([]);
    expect(normalized.diagnostics.filter((d) => d.code === 'beam-invalid')).toHaveLength(1);
  });

  it('drops a beam that claims an event already claimed by an earlier beam', () => {
    const doc = mnx(
      {},
      withPart(
        {
          beams: [
            { events: ['a', 'b'] },
            { events: ['b', 'c'] },
          ],
        },
        measure(
          note('C5', '8', { id: 'a' }),
          note('D5', '8', { id: 'b' }),
          note('E5', '8', { id: 'c' }),
          rest('8'),
        ),
      ),
    );
    const normalized = normalize(doc);
    expect(normalized.beams).toHaveLength(1);
    expect(normalized.beams[0]!.elements).toEqual(['a', 'b']);
    expect(normalized.diagnostics.filter((d) => d.code === 'beam-invalid')).toHaveLength(1);
  });

  it('clips an auto-beam group at the measure capacity instead of referencing dropped events', () => {
    const doc = mnx(
      {},
      measure(
        note('C4', '8', { id: 'a' }),
        note('C4', '8', { id: 'b' }),
        note('C4', '8', { id: 'c' }),
        note('C4', '8', { id: 'd' }),
        note('C4', '8', { id: 'e' }),
        note('C4', '8', { id: 'f' }),
        note('C4', '8', { id: 'g' }),
        note('C4', '8', { id: 'h' }),
        note('C4', '16', { id: 'overflow1' }),
        note('C4', '16', { id: 'overflow2' }),
      ),
    );
    const normalized = normalize(doc);
    const referenced = normalized.beams.flatMap((b) => b.elements);
    expect(referenced).not.toContain('overflow1');
    expect(referenced).not.toContain('overflow2');
    const laidOut = layoutScore(doc);
    expect(laidOut.diagnostics.some((d) => d.code === 'measure-overfull')).toBe(true);
  });

  it('reports beam-grouping-invalid once for an auto-beamed measure with a bad beatGrouping option', () => {
    const doc = mnx({ time: { count: 7, unit: 8 } }, measure(...Array.from({ length: 7 }, (_, i) => note('C4', '8', { id: `e${i}` }))));
    const options = { beaming: { beatGrouping: { '7/8': [3, 3] } } };
    const normalized = normalize(doc, options);
    expect(normalized.diagnostics.filter((d) => d.code === 'beam-grouping-invalid')).toHaveLength(1);
    expect(normalized.beams.length).toBeGreaterThan(0);
  });

  it('breaks a derived secondary segment at a rest an explicit beam spans (two hooks, not a bridging run)', () => {
    const doc = mnx(
      {},
      withPart(
        { beams: [{ events: ['a', 'b'] }] },
        measure(note('C5', '16', { id: 'a' }), rest('16'), note('D5', '16', { id: 'b' }), note('E5', 'h.')),
      ),
    );
    const beam = normalize(doc).beams[0]!;
    expect(beam.segments).toEqual([
      { level: 2, first: 'a', last: 'a', hook: 'right' },
      { level: 2, first: 'b', last: 'b', hook: 'left' },
    ]);
  });
});

describe('silent-drop constructs', () => {
  const base = (): MnxDocument => mnx({}, measure(note('C4', 'w')));
  const cases: [string, (doc: MnxDocument) => void][] = [
    ['layouts', (d) => Object.assign(d, { layouts: [{ id: 'l', content: [] }] })],
    ['useAccidentalDisplay', (d) => Object.assign(d.mnx, { support: { useAccidentalDisplay: false } })],
    ['scores', (d) => Object.assign(d, { scores: [{ name: 'T', useWritten: true, layout: 'l', pages: [{ layout: 'l', systems: [{ measure: 'x', layout: 'l' }] }] }] })],
    ['part name', (d) => Object.assign(d.parts[0]!, { name: 'Piano' })],
    ['global lyrics', (d) => Object.assign(d.global, { lyrics: { lineMetadata: {}, lineOrder: [] } })],
    ['clef', (d) => Object.assign(d.parts[0]!.measures![0]!.clefs![0]!.clef, { glyph: 'gClef', hide: true, showOctave: true, color: 'red' })],
    ['clef graceIndex', (d) => Object.assign(d.parts[0]!.measures![0]!.clefs![0]!, { position: { fraction: [0, 1], graceIndex: 0 } })],
    ['tempo graceIndex', (d) => Object.assign(d.global.measures![0]!, { tempos: [{ bpm: 90, location: { fraction: [0, 1], graceIndex: 1 } }] })],
    ['accidental force', (d) => Object.assign(d.parts[0]!.measures![0]!.sequences![0]!.content[0]!, { notes: [{ pitch: { step: 'C', octave: 4 }, accidentalDisplay: { show: true, force: true } }] })],
    ['breath placement', (d) => Object.assign(d.parts[0]!.measures![0]!.sequences![0]!.content[0]!, { markings: { breath: { placement: 'above' } } })],
    ['visualDuration', (d) => { d.parts[0]!.measures![0]!.sequences![0] = { content: [], fullMeasure: { visualDuration: { base: 'whole' } } } as never; }],
  ];
  it.each(cases)('reports %s', (_name, patch) => {
    const doc = base();
    patch(doc);
    const result = layoutScore(doc);
    expect(result.diagnostics.some((d) => d.code === 'mnx-unsupported')).toBe(true);
    expect(result.systems.length).toBeGreaterThan(0);
  });

  it('honors tie side', () => {
    const tied = (side?: 'up' | 'down'): MnxDocument =>
      mnx({}, measure(note('C4', 'h', {}, { id: 'a', ties: [{ target: 'b', ...(side ? { side } : {}) }] }), note('C4', 'h', {}, { id: 'b' })));
    const d = (side?: 'up' | 'down'): string => layoutScore(tied(side)).paths.find((p) => p.cls === 'tie')!.d;
    expect(d('up')).not.toBe(d('down'));
  });
});

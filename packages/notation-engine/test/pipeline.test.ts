// normalize + temporal composed, entered through the real stage functions.

import { describe, expect, it } from 'vitest';
import type { MnxDocument } from '@polyhymnia/notation-model';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import { engravingDefaults, glyphAdvanceWidth, glyphAnchor } from '../src/font/metadata.js';
import { GLYPH_CODEPOINT } from '../src/font/glyphs.js';
import { fixture, measure, mnx, note, withGlobal } from './mnx.js';

describe('normalize — forward inheritance', () => {
  it('carries clef, key and time forward until a measure restates them', () => {
    const measures = normalize(fixture('inheritance')).staves[0]!.measures;

    expect(measures.map((m) => `${m.time.beats}/${m.time.beatType}`)).toEqual([
      '4/4',
      '3/4',
      '3/4',
      '3/4',
      '3/4',
    ]);
    expect(measures.map((m) => m.clef.kind)).toEqual(['treble', 'treble', 'treble', 'bass', 'bass']);
    expect(measures.map((m) => m.key.fifths)).toEqual([2, 2, 2, -3, -3]);
  });

  it('resolves capacity per measure, including the pickup exemption', () => {
    const measures = normalize(fixture('pickup')).staves[0]!.measures;
    expect(measures.map((m) => m.capacityTicks)).toEqual([1680, 13440, 10080]);
    expect(measures[0]!.pickup).toBe(true);
  });
});

describe('normalize — never throws', () => {
  const malformed = {
    id: 42,
    mnx: { version: 1 },
    global: {
      measures: [
        { time: { count: 0, unit: 0 }, key: { fifths: 99 } },
        { time: { count: 3, unit: 4 } },
        {},
        null,
      ],
    },
    parts: [
      {
        measures: [
          { clefs: [{ clef: { sign: 'kazoo' } }], sequences: 'not an array' },
          { sequences: [{ content: null }] },
          { sequences: [{ content: [] }, { content: [] }, { content: [] }] },
          null,
        ],
      },
    ],
  } as unknown as MnxDocument;

  it('degrades a deliberately malformed MNX document into diagnostics', () => {
    const normalized = normalize(malformed, { divisions: -7 });
    const codes = normalized.diagnostics.map((d) => d.code);

    expect(codes).toContain('invalid-divisions');
    expect(codes).toContain('invalid-time-signature');
    expect(codes).toContain('missing-sequences');
    expect(codes).toContain('too-many-voices');
    expect(normalized.divisions).toBe(3360);
    expect(normalized.staves[0]!.measures[0]!.clef.kind).toBe('treble');
    expect(normalized.staves[0]!.measures[0]!.key.fifths).toBe(7);
    expect(normalized.staves[0]!.measures[0]!.time).toEqual({ beats: 4, beatType: 4 });
    expect(normalized.staves[0]!.measures[1]!.time).toEqual({ beats: 3, beatType: 4 });
    expect(normalized.staves[0]!.measures[2]!.time).toEqual({ beats: 3, beatType: 4 });
  });

  it('survives an empty, missing or nonsense document', () => {
    expect(() => normalize(undefined as unknown as MnxDocument)).not.toThrow();
    expect(() => normalize({} as MnxDocument)).not.toThrow();
    expect(normalize({} as MnxDocument).diagnostics.map((d) => d.code)).toContain('mnx-invalid');
    expect(normalize({ mnx: { version: 1 }, global: { measures: [] }, parts: [] }).diagnostics.map((d) => d.code)).toContain(
      'no-parts',
    );
    expect(() => temporal(normalize(malformed))).not.toThrow();
  });

  it('reports an unknown mnx.version and still lays out what it can read', () => {
    const doc = { ...mnx({}, measure(note('C4', 'w'))), mnx: { version: 2 } };
    const normalized = normalize(doc);

    expect(normalized.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'mnx-unsupported-version' }),
    );
    expect(temporal(normalized).elements).toHaveLength(1);
  });
});

describe('temporal', () => {
  it('derives onsets by summing preceding durations, with no stored onset', () => {
    const doc = mnx(
      {},
      measure(note('C4', 'q'), note('D4', '8'), note('E4', '8'), note('F4', 'h')),
      measure(note('G4', 'w')),
    );
    const map = temporal(normalize(doc));

    expect(map.elements.map((e) => e.tick)).toEqual([0, 3360, 5040, 6720, 13440]);
    expect(map.elements.map((e) => e.measureTick)).toEqual([0, 3360, 5040, 6720, 0]);
    expect(map.measures.map((m) => [m.startTick, m.endTick])).toEqual([
      [0, 13440],
      [13440, 26880],
    ]);
  });

  it('pads an underfull measure instead of throwing', () => {
    const map = temporal(normalize(mnx({}, measure(note('C4', 'w')), measure(note('C4', 'q')))));
    const second = map.elements.filter((e) => e.measureIndex === 1);

    expect(map.diagnostics.map((d) => d.code)).toEqual(['measure-underfull']);
    expect(second).toHaveLength(2);
    expect(second[1]!.synthetic).toBe(true);
    expect(second[1]!.durationTicks).toBe(10080);
  });

  it('truncates an overfull measure at the barline', () => {
    const map = temporal(normalize(mnx({}, measure(note('C4', 'w'), note('D4', 'h'), note('E4', 'q')))));

    expect(map.diagnostics.map((d) => d.code)).toEqual(['measure-overfull']);
    expect(map.diagnostics[0]!.severity).toBe('error');
    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([[0, 13440]]);
    expect(map.measures[0]!.endTick).toBe(13440);
  });

  it('gives a whole-bar rest the measure capacity, not the whole note length', () => {
    const map = temporal(normalize(fixture('whole-bar-9-8')));

    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([
      [0, 15120],
      [15120, 15120],
    ]);
    expect(map.diagnostics).toEqual([]);
  });

  it('honours the divisions option', () => {
    const doc = mnx({}, withGlobal({ time: { count: 4, unit: 4 } }, measure(note('C4', 'q'), note('D4', 'h.'))));
    const map = temporal(normalize(doc, { divisions: 480 }));
    expect(map.divisions).toBe(480);
    expect(map.elements.map((e) => e.durationTicks)).toEqual([480, 1440]);
  });
});

describe('font metrics come from the metadata JSON', () => {
  it('reads engravingDefaults rather than hardcoding them', () => {
    expect(engravingDefaults.staffLineThickness).toBe(0.13);
    expect(engravingDefaults.stemThickness).toBe(0.12);
    expect(engravingDefaults.beamThickness).toBe(0.5);
    expect(engravingDefaults.beamSpacing).toBe(0.25);
    expect(engravingDefaults.legerLineExtension).toBe(0.4);
    expect(engravingDefaults.tupletBracketThickness).toBe(0.16);
    expect(engravingDefaults.repeatBarlineDotSeparation).toBe(0.16);
  });

  it('exposes advance widths and anchors per glyph', () => {
    expect(glyphAdvanceWidth('noteheadBlack')).toBeCloseTo(1.18, 5);
    expect(glyphAnchor('noteheadBlack', 'stemUpSE')).toEqual([1.18, 0.168]);
    expect(glyphAdvanceWidth('notAGlyph')).toBe(0);
  });

  it('maps the 61-glyph subset to codepoints, augmentationDot included', () => {
    expect(Object.keys(GLYPH_CODEPOINT)).toHaveLength(61);
    expect(GLYPH_CODEPOINT.augmentationDot).toBe(0xe1e7);
    expect(GLYPH_CODEPOINT.restQuarter).toBe(0xe4e5);
    expect(GLYPH_CODEPOINT.gClef).toBe(0xe050);
    expect(GLYPH_CODEPOINT.repeatDot).toBe(0xe044);
    expect(GLYPH_CODEPOINT.fClef8va).toBe(0xe065);
    expect(GLYPH_CODEPOINT.breathMarkComma).toBe(0xe4ce);
    expect(GLYPH_CODEPOINT.caesura).toBe(0xe4d1);
    // The codepoint table and the metadata are two views of one manifest — a name in
    // either that the other lacks is a build that has drifted.
    expect(Object.keys(GLYPH_CODEPOINT).every((name) => glyphAdvanceWidth(name) > 0)).toBe(true);
  });
});

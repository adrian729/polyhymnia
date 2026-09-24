// normalize + temporal composed, entered through the real stage functions.

import { beforeEach, describe, expect, it } from 'vitest';
import { measure, note, resetIdCounter, score, voice, wholeBarRest } from '../src/build/index.js';
import { normalize } from '../src/layout/normalize.js';
import { temporal } from '../src/layout/temporal.js';
import { engravingDefaults, glyphAdvanceWidth, glyphAnchor } from '../src/font/metadata.js';
import { GLYPH_CODEPOINT } from '../src/font/glyphs.js';
import type { ScoreDoc } from '../src/model/types.js';

beforeEach(() => resetIdCounter());

describe('normalize — forward inheritance', () => {
  it('carries clef, key and time forward until a measure restates them', () => {
    const doc = score(
      { clef: 'treble', key: 2, time: { beats: 4, beatType: 4 } },
      measure(note('C4', 'w')),
      measure({ time: { beats: 3, beatType: 4 } }, note('D4', 'h.')),
      measure(note('E4', 'h.')),
      measure({ clef: 'bass', key: -3 }, note('E2', 'h.')),
      measure(note('F2', 'h.')),
    );
    const measures = normalize(doc).staves[0]!.measures;

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
    const doc = score(
      { clef: 'treble' },
      measure({ pickup: true }, note('G3', '8')),
      measure(note('C4', 'w')),
      measure({ time: { beats: 3, beatType: 4 } }, note('D4', 'h.')),
    );
    const measures = normalize(doc).staves[0]!.measures;
    expect(measures.map((m) => m.capacityTicks)).toEqual([1680, 13440, 10080]);
    expect(measures[0]!.pickup).toBe(true);
  });
});

describe('normalize — never throws', () => {
  const malformed = {
    id: 42,
    divisions: -7,
    tempo: 'fast',
    staves: [
      {
        id: 's',
        clef: { kind: 'kazoo' },
        key: { fifths: 99 },
        time: { beats: 0, beatType: 0 },
        measures: [
          { id: 'm0', voices: 'not an array' },
          { id: 'm1', time: { beats: 3, beatType: 4 }, voices: [{ index: 0, elements: null }] },
          {
            id: 'm2',
            voices: [
              { id: 'v0', index: 0, elements: [] },
              { id: 'v1', index: 1, elements: [] },
              { id: 'v2', index: 0, elements: [] },
            ],
          },
          null,
        ],
      },
    ],
  } as unknown as ScoreDoc;

  it('degrades a deliberately malformed ScoreDoc into diagnostics', () => {
    const normalized = normalize(malformed);
    const codes = normalized.diagnostics.map((d) => d.code);

    expect(codes).toContain('invalid-divisions');
    expect(codes).toContain('invalid-time-signature');
    expect(codes).toContain('missing-voices');
    expect(codes).toContain('too-many-voices');
    expect(normalized.divisions).toBe(3360);
    // Unreadable clef/key/time fall back rather than propagate undefined downstream.
    expect(normalized.staves[0]!.measures[0]!.clef.kind).toBe('treble');
    expect(normalized.staves[0]!.measures[0]!.key.fifths).toBe(7);
    expect(normalized.staves[0]!.measures[0]!.time).toEqual({ beats: 4, beatType: 4 });
    // A valid meter later in the score still takes effect and still inherits forward.
    expect(normalized.staves[0]!.measures[1]!.time).toEqual({ beats: 3, beatType: 4 });
    expect(normalized.staves[0]!.measures[2]!.time).toEqual({ beats: 3, beatType: 4 });
  });

  it('survives an empty, missing or nonsense document', () => {
    expect(() => normalize(undefined as unknown as ScoreDoc)).not.toThrow();
    expect(() => normalize({} as ScoreDoc)).not.toThrow();
    expect(normalize({} as ScoreDoc).diagnostics.map((d) => d.code)).toContain('no-staves');
    expect(() => temporal(normalize(malformed))).not.toThrow();
  });
});

describe('temporal', () => {
  it('derives onsets by summing preceding durations, with no stored onset', () => {
    const doc = score(
      { clef: 'treble' },
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

  it('pads an underfull hand-built measure instead of throwing', () => {
    const hand: ScoreDoc = {
      id: 'hand',
      divisions: 3360,
      tempo: [],
      staves: [
        {
          id: 's',
          clef: { kind: 'treble' },
          key: { fifths: 0 },
          time: { beats: 4, beatType: 4 },
          measures: [{ id: 'm0' as never, voices: [voice(0, note('C4', 'q'))] }],
        },
      ],
    };
    const map = temporal(normalize(hand));

    expect(map.diagnostics.map((d) => d.code)).toEqual(['measure-underfull']);
    expect(map.elements).toHaveLength(2);
    expect(map.elements[1]!.synthetic).toBe(true);
    expect(map.elements[1]!.durationTicks).toBe(10080);
  });

  it('truncates an overfull hand-built measure at the barline', () => {
    const hand: ScoreDoc = {
      id: 'hand',
      divisions: 3360,
      tempo: [],
      staves: [
        {
          id: 's',
          clef: { kind: 'treble' },
          key: { fifths: 0 },
          time: { beats: 4, beatType: 4 },
          measures: [
            {
              id: 'm0' as never,
              voices: [voice(0, note('C4', 'w'), note('D4', 'h'), note('E4', 'q'))],
            },
          ],
        },
      ],
    };
    const map = temporal(normalize(hand));

    expect(map.diagnostics.map((d) => d.code)).toEqual(['measure-overfull']);
    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([[0, 13440]]);
    expect(map.measures[0]!.endTick).toBe(13440);
  });

  it('gives a whole-bar rest the measure capacity, not the whole note length', () => {
    const doc = score(
      { clef: 'treble', time: { beats: 9, beatType: 8 } },
      measure(wholeBarRest()),
      measure(wholeBarRest()),
    );
    const map = temporal(normalize(doc));

    expect(map.elements.map((e) => [e.tick, e.durationTicks])).toEqual([
      [0, 15120],
      [15120, 15120],
    ]);
    expect(map.diagnostics).toEqual([]);
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

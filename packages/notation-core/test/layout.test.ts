// Stages 1-8 + 11 through the real entry point: `ScoreDoc -> layoutScore() ->
// LayoutResult`, never a stage in isolation (roadmap.md's testing philosophy).

import { beforeEach, describe, expect, it } from 'vitest';
import {
  chord,
  measure,
  note,
  rest,
  resetIdCounter,
  score,
  voice,
  wholeBarRest,
} from '../src/build/index.js';
import { layoutScore } from '../src/layout/index.js';
import { glyphBBox } from '../src/font/metadata.js';
import { GLYPH_CODEPOINT } from '../src/font/glyphs.js';
import type { ElementBox, GlyphRun, LayoutResult } from '../src/layout/types.js';
import type { NoteId } from '../src/model/types.js';

beforeEach(() => resetIdCounter());

const cp = (name: string): number => GLYPH_CODEPOINT[name]!;

function glyphsOf(layout: LayoutResult, cls: string): readonly GlyphRun[] {
  return layout.glyphs.filter((g) => g.cls === cls);
}

function boxes(layout: LayoutResult): ElementBox[] {
  return Object.values(layout.elements);
}

describe('chords are addressable per member', () => {
  it('emits one ElementBox per notehead, sharing x and tick', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(chord([note('C4', 'w'), note('E4', 'w'), note('G4', 'w'), note('B4', 'w')])),
      ),
    );
    const members = boxes(layout).filter((b) => b.kind === 'chord');

    expect(members).toHaveLength(4);
    expect(new Set(members.map((b) => b.x)).size).toBe(1); // no seconds -> no shift
    expect(new Set(members.map((b) => b.tick)).size).toBe(1);
    expect(new Set(members.map((b) => b.durationTicks)).size).toBe(1);
    // C4 is below the staff in treble, B4 sits on the middle line.
    expect(members.map((b) => b.staffPosition).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    expect(new Set(members.map((b) => b.y)).size).toBe(4);
    expect(new Set(members.map((b) => JSON.stringify(b.hitBox))).size).toBe(4);
    expect(members.map((b) => b.label)).toEqual([
      'C 4, whole note, measure 1',
      'E 4, whole note, measure 1',
      'G 4, whole note, measure 1',
      'B 4, whole note, measure 1',
    ]);
    // A whole note has no stem, and this slice draws no beams.
    expect(layout.rects.some((r) => r.cls === 'stem')).toBe(false);
    expect(layout.paths).toEqual([]);
    expect(layout.slots).toEqual([]);
  });

  it('shifts a chord member a second above its neighbour off the stem', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure(chord([note('C4', 'q'), note('D4', 'q')]), rest('h.'))),
    );
    const members = boxes(layout)
      .filter((b) => b.kind === 'chord')
      .sort((a, b) => a.staffPosition - b.staffPosition);

    expect(members).toHaveLength(2);
    // D4 (upper, smaller staffPosition) moves one notehead width right of the stem.
    expect(members[0]!.x).toBeCloseTo(members[1]!.x + 1.18, 5);
  });
});

describe('accidentals', () => {
  it('suppresses accidentals already carried by the key signature', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble', key: 2 },
        measure(note('D4', 'q'), note('E4', 'q'), note('F#4', 'q'), note('G4', 'q')),
        measure(note('A4', 'q'), note('B4', 'q'), note('C#5', 'q'), note('D5', 'q')),
      ),
    );

    expect(glyphsOf(layout, 'accidental')).toHaveLength(0);
    // The key signature itself is still drawn, twice: it is a one-system score, so only
    // the first measure states it.
    expect(glyphsOf(layout, 'key-accidental')).toHaveLength(2);
    expect(glyphsOf(layout, 'key-accidental').every((g) => g.cp === cp('accidentalSharp'))).toBe(
      true,
    );
  });

  it('writes an accidental once per measure, again in the next, never on a tie-stop', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(note('F#4', 'q'), note('F#4', 'q'), note('G4', 'h')),
        measure(note('F#4', 'q'), note('A4', 'q'), note('F#4', 'h', { tie: 'start' })),
        measure(note('F#4', 'h', { tie: 'stop' }), note('G4', 'h')),
      ),
    );
    const accidentals = glyphsOf(layout, 'accidental');

    // measure 1: one sharp for the pair; measure 2: state resets, one more; measure 3:
    // the tie-stop carries the alteration across the barline, so nothing is written.
    expect(accidentals).toHaveLength(2);
    expect(accidentals.every((g) => g.cp === cp('accidentalSharp'))).toBe(true);
  });

  it('honours the per-note policy override', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(
          note('F4', 'q', { accidental: 'always' }),
          note('F#4', 'q', { accidental: 'never' }),
          note('G4', 'h'),
        ),
      ),
    );
    const accidentals = glyphsOf(layout, 'accidental');

    expect(accidentals).toHaveLength(1);
    expect(accidentals[0]!.cp).toBe(cp('accidentalNatural'));
  });

  it('stacks a chord’s accidentals into non-overlapping columns left of the notehead', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(chord([note('C#4', 'w'), note('Eb4', 'w'), note('G#4', 'w')])),
      ),
    );
    const accidentals = glyphsOf(layout, 'accidental');
    const noteX = boxes(layout)[0]!.x;

    expect(accidentals).toHaveLength(3);
    expect(accidentals.every((g) => g.x < noteX)).toBe(true);
    // Three pitches this close vertically cannot share a column.
    expect(new Set(accidentals.map((g) => +g.x.toFixed(3))).size).toBe(3);
  });
});

describe('ledger lines', () => {
  it('draws every line crossed above and below the staff, but none for a note in a space', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure(note('C6', 'h'), note('C3', 'h'))),
    );
    const ledgers = layout.rects.filter((r) => r.cls === 'ledger-line');
    const staffTop = layout.systems[0]!.y;
    const byPosition = ledgers
      .map((r) => +(r.y + r.h / 2 - staffTop).toFixed(3))
      .sort((a, b) => a - b);

    // C6 is two ledger lines above (positions -1, -2); C3 is four below (5..8).
    expect(byPosition).toEqual([-2, -1, 5, 6, 7, 8]);
    expect(ledgers.every((r) => Math.abs(r.h - 0.16) < 1e-9)).toBe(true);
    // 0.4sp overhang each side of a 1.18sp notehead.
    expect(ledgers.every((r) => Math.abs(r.w - (1.18 + 0.8)) < 1e-9)).toBe(true);
  });

  it('gives a note in the first space above the staff no ledger line at all', () => {
    // G5 sits in the space above the top line; A5, a step higher, lands on the first
    // ledger line and so gets it.
    expect(
      layoutScore(score({ clef: 'treble' }, measure(note('G5', 'w')))).rects.filter(
        (r) => r.cls === 'ledger-line',
      ),
    ).toHaveLength(0);
    expect(
      layoutScore(score({ clef: 'treble' }, measure(note('A5', 'w')))).rects.filter(
        (r) => r.cls === 'ledger-line',
      ),
    ).toHaveLength(1);
  });
});

describe('rests', () => {
  it('draws one centred whole rest for a whole-bar rest in 9/8', () => {
    const layout = layoutScore(
      score({ clef: 'treble', time: { beats: 9, beatType: 8 } }, measure(wholeBarRest())),
    );
    const rests = glyphsOf(layout, 'rest');
    const box = boxes(layout)[0]!;

    expect(rests).toHaveLength(1);
    expect(rests[0]!.cp).toBe(cp('restWhole'));
    // Capacity, not the nominal 'whole' Duration: 9/8 = 15120 ticks at 3360/quarter.
    expect(box.durationTicks).toBe(15120);
    expect(box.label).toBe('whole-bar rest, measure 1');

    // Centred in its column rather than sitting at the column's left edge.
    const measureBox = layout.timemap.measures[0]!;
    const centre = rests[0]!.x + 1.132 / 2;
    expect(centre).toBeGreaterThan(measureBox.x);
    expect(centre).toBeLessThan(measureBox.x + measureBox.w);
  });

  it('anchors rests where the Bravura glyph metadata says, not where engraving.md guesses', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(rest('q'), rest('q'), rest('h')),
        measure(rest('8'), rest('8'), rest('q'), rest('h')),
      ),
    );
    const restY = (name: string): number => {
      const staffTop = layout.systems[0]!.y;
      const found = glyphsOf(layout, 'rest').find((g) => g.cp === cp(name))!;
      return +(found.y - staffTop).toFixed(3);
    };

    // Middle-line baseline for everything that is centred on or sits on its origin.
    expect(restY('restQuarter')).toBe(2);
    expect(restY('restHalf')).toBe(2);
    expect(restY('rest8th')).toBe(2);

    // The metadata is what makes those placements right: a half rest sits entirely above
    // its origin, a quarter rest straddles it, and a whole rest hangs below it — which is
    // why the whole rest, alone, anchors a line higher.
    expect(glyphBBox('restHalf').bBoxSW[1]).toBeCloseTo(-0.008, 3);
    expect(glyphBBox('restWhole').bBoxNE[1]).toBeCloseTo(0.036, 3);
    expect(glyphBBox('restWhole').bBoxSW[1]).toBeCloseTo(-0.54, 3);

    const whole = layoutScore(score({ clef: 'treble' }, measure(rest('w'))));
    const wholeGlyph = glyphsOf(whole, 'rest')[0]!;
    expect(+(wholeGlyph.y - whole.systems[0]!.y).toFixed(3)).toBe(1);
  });
});

describe('systems', () => {
  it('breaks greedily at options.widthSp and keeps column x strictly increasing', () => {
    const doc = score(
      { clef: 'treble' },
      ...Array.from({ length: 8 }, () =>
        measure(note('C4', 'q'), note('D4', 'q'), note('E4', 'q'), note('F4', 'q')),
      ),
    );
    const layout = layoutScore(doc, { widthSp: 40 });

    expect(layout.systems.length).toBeGreaterThan(1);
    for (const system of layout.systems) {
      const xs = boxes(layout)
        .filter((b) => b.systemIndex === system.index)
        .sort((a, b) => a.tick - b.tick)
        .map((b) => b.x);
      for (let i = 1; i < xs.length; i += 1) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
      expect(system.w).toBeLessThanOrEqual(40 + 1e-6);
    }
    // Five staff lines per system, and the clef restated on each.
    expect(layout.rects.filter((r) => r.cls === 'staff-line')).toHaveLength(
      5 * layout.systems.length,
    );
    expect(glyphsOf(layout, 'clef')).toHaveLength(layout.systems.length);
  });

  it('honours a forced systemBreak', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure({ systemBreak: true }, note('C4', 'w')),
        measure(note('D4', 'w')),
      ),
    );
    expect(layout.systems).toHaveLength(2);
    expect(boxes(layout).map((b) => b.systemIndex).sort()).toEqual([0, 1]);
  });

  it('does not force the last system to the full width', () => {
    const layout = layoutScore(score({ clef: 'treble' }, measure(note('C4', 'w'))), {
      widthSp: 100,
    });
    // maxLastSystemFill 0.65 — stretched to 65sp at most, never to 100.
    expect(layout.systems[0]!.w).toBeLessThanOrEqual(65 + 1e-6);
  });
});

describe('chrome', () => {
  it('draws clef, key and time once, and restates them on a change', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble', key: 1, time: { beats: 4, beatType: 4 } },
        measure(note('C4', 'w')),
        measure({ key: -2, time: { beats: 3, beatType: 4 } }, note('D4', 'h.')),
        measure(note('E4', 'h.')),
      ),
      { widthSp: 200 },
    );

    expect(glyphsOf(layout, 'clef')).toHaveLength(1);
    // 4/4 then 3/4 — two digits each, drawn twice.
    expect(glyphsOf(layout, 'time-signature')).toHaveLength(4);
    const keyGlyphs = glyphsOf(layout, 'key-accidental');
    // 1 sharp, then a cancelling natural plus 2 flats.
    expect(keyGlyphs.filter((g) => g.cp === cp('accidentalSharp'))).toHaveLength(1);
    expect(keyGlyphs.filter((g) => g.cp === cp('accidentalNatural'))).toHaveLength(1);
    expect(keyGlyphs.filter((g) => g.cp === cp('accidentalFlat'))).toHaveLength(2);
  });

  it('places the treble key signature where engraving.md says', () => {
    const layout = layoutScore(score({ clef: 'treble', key: 3 }, measure(note('C4', 'w'))));
    const staffTop = layout.systems[0]!.y;
    expect(glyphsOf(layout, 'key-accidental').map((g) => +(g.y - staffTop).toFixed(3))).toEqual([
      0, 1.5, -0.5,
    ]);
  });

  it('derives bass, alto and tenor key placement from the treble pattern', () => {
    const at = (kind: 'bass' | 'alto' | 'tenor'): number[] => {
      const layout = layoutScore(score({ clef: kind, key: 2 }, measure(note('C3', 'w'))));
      const staffTop = layout.systems[0]!.y;
      return glyphsOf(layout, 'key-accidental').map((g) => +(g.y - staffTop).toFixed(3));
    };
    expect(at('bass')).toEqual([1, 2.5]); // treble pattern one space lower
    expect(at('alto')).toEqual([0.5, 2]);
    // Tenor is the irregularity: F#/C# an octave down, off the ledger line.
    expect(at('tenor')).toEqual([3, 1]);
  });

  it('draws an octave-up bass clef with its own glyph', () => {
    const glyphAt = (octaveShift: -1 | 0 | 1): number =>
      glyphsOf(
        layoutScore(score({ clef: 'bass', octaveShift }, measure(note('D3', 'w')))),
        'clef',
      )[0]!.cp;

    expect(glyphAt(1)).toBe(0xe065); // fClef8va — no longer falls back to the plain clef
    expect(glyphAt(1)).toBe(cp('fClef8va'));
    expect(glyphAt(1)).not.toBe(glyphAt(0));
    expect(glyphAt(0)).toBe(cp('fClef'));
    expect(glyphAt(-1)).toBe(cp('fClef8vb'));
  });

  it('draws a final barline thin-then-thick at the measure edge', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure({ barlineEnd: 'final' }, note('C4', 'w'))),
    );
    const barlines = layout.rects.filter((r) => r.cls === 'barline').sort((a, b) => a.x - b.x);
    expect(barlines.map((r) => r.w)).toEqual([0.16, 0.5]);
    expect(barlines[1]!.x + barlines[1]!.w).toBeCloseTo(layout.systems[0]!.w, 5);
  });

  it('draws a dashed barline as dash segments spanning the staff, not one rect', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure({ barlineEnd: 'dashed' }, note('C4', 'w'))),
    );
    const staffTop = layout.systems[0]!.y;
    const dashes = layout.rects.filter((r) => r.cls === 'barline').sort((a, b) => a.y - b.y);

    expect(dashes.length).toBeGreaterThan(1);
    // One vertical line's worth of x, at the measure edge, one dash thick throughout.
    expect(new Set(dashes.map((r) => +r.x.toFixed(6))).size).toBe(1);
    expect(dashes.every((r) => Math.abs(r.w - 0.16) < 1e-9)).toBe(true);
    expect(dashes[0]!.x + 0.16).toBeCloseTo(layout.systems[0]!.w, 5);
    // Top line to bottom line, but broken: no segment covers the whole 4sp staff.
    expect(dashes[0]!.y).toBeCloseTo(staffTop, 5);
    const last = dashes[dashes.length - 1]!;
    expect(last.y + last.h).toBeCloseTo(staffTop + 4, 5);
    expect(dashes.every((r) => r.h < 4)).toBe(true);
    // Every gap is exactly dashedBarlineGapLength — that cadence is what reads as dashed.
    for (let i = 1; i < dashes.length; i += 1) {
      const gap = dashes[i]!.y - (dashes[i - 1]!.y + dashes[i - 1]!.h);
      expect(gap).toBeCloseTo(0.25, 6);
    }
  });

  it('gives a dashed barline the same width contribution as a single one', () => {
    const at = (barlineEnd: 'dashed' | 'single' | 'none'): number => {
      const layout = layoutScore(
        score(
          { clef: 'treble' },
          measure({ barlineEnd }, note('C4', 'w')),
          measure(note('D4', 'w')),
        ),
      );
      return boxes(layout).sort((a, b) => a.tick - b.tick)[1]!.x;
    };
    // A dashed barline is a thin line's worth of space — broken vertically, not
    // horizontally — so it pushes the next measure exactly as far as `single` does.
    expect(at('dashed')).toBeCloseTo(at('single'), 6);
    expect(at('dashed')).toBeGreaterThan(at('none'));
  });
});

describe('stems and flags', () => {
  it('points stems away from the middle line and down when on it', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure(note('C4', 'q'), note('B4', 'q'), note('G5', 'h'))),
    );
    const staffTop = layout.systems[0]!.y;
    const stems = layout.rects.filter((r) => r.cls === 'stem').sort((a, b) => a.x - b.x);

    expect(stems).toHaveLength(3);
    // C4 sits below the middle line (staffPosition 5) -> stem up, 3.5sp above it.
    expect(+(stems[0]!.y - staffTop).toFixed(3)).toBe(1.5);
    // B4 is ON the middle line -> stem down by convention, from the notehead anchor.
    expect(+(stems[1]!.y - staffTop).toFixed(3)).toBeCloseTo(2.168, 3);
    // G5 above the middle line (staffPosition -0.5) -> stem down.
    expect(+(stems[2]!.y - staffTop).toFixed(3)).toBeCloseTo(-0.332, 3);
    expect(stems.every((s) => Math.abs(s.w - 0.12) < 1e-9)).toBe(true);
    expect(stems.every((s) => Math.abs(s.h - (3.5 - 0.168)) < 1e-6)).toBe(true);
  });

  it('flags eighths and shorter, since beaming is a later stage', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(note('C4', '8'), note('D4', '8'), note('E4', '16'), rest('16'), rest('h'), rest('8')),
      ),
    );
    const flags = glyphsOf(layout, 'flag');
    expect(flags.map((g) => g.cp)).toEqual([cp('flag8thUp'), cp('flag8thUp'), cp('flag16thUp')]);
  });

  it('draws augmentation dots off the staff line', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble', time: { beats: 3, beatType: 4 } },
        measure(note('B4', 'h.')),
        measure(note('A4', 'h.')),
      ),
    );
    const staffTop = layout.systems[0]!.y;
    const dots = [...glyphsOf(layout, 'dot')].sort((a, b) => a.x - b.x);
    expect(dots).toHaveLength(2);
    // B4 is on the middle line (2.0) -> the dot is nudged up half a space.
    expect(+(dots[0]!.y - staffTop).toFixed(3)).toBe(1.5);
    // A4 already sits in a space (2.5) -> the dot stays level with it.
    expect(+(dots[1]!.y - staffTop).toFixed(3)).toBe(2.5);
  });
});

describe('breath marks', () => {
  it('draws the mark just past the note, above the staff, without consuming time', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure(note('C4', 'h', { breath: 'comma' }), note('D4', 'h'))),
    );
    const staffTop = layout.systems[0]!.y;
    const marks = glyphsOf(layout, 'breath');
    const notes = boxes(layout).sort((a, b) => a.tick - b.tick);

    expect(marks).toHaveLength(1);
    expect(marks[0]!.cp).toBe(0xe4ce); // breathMarkComma
    // Anchored on the top staff line, so its ink hangs in the space above the staff.
    expect(marks[0]!.y).toBeCloseTo(staffTop, 6);
    expect(marks[0]!.y).toBeGreaterThanOrEqual(staffTop - 0.5);
    expect(marks[0]!.y).toBeLessThanOrEqual(staffTop + 4);
    // Past the notehead it belongs to, and clear of the note that follows.
    expect(marks[0]!.x).toBeGreaterThan(notes[0]!.x + notes[0]!.w);
    expect(notes[1]!.x).toBeGreaterThan(marks[0]!.x + 0.612); // breathMarkComma advance
    // Two half notes still fill the bar exactly — a breath adds no rest, no diagnostic.
    expect(notes).toHaveLength(2);
    expect(layout.diagnostics).toEqual([]);
  });

  it('uses the caesura glyph for a caesura', () => {
    const layout = layoutScore(
      score({ clef: 'treble' }, measure(note('C4', 'h', { breath: 'caesura' }), note('D4', 'h'))),
    );
    expect(glyphsOf(layout, 'breath').map((g) => g.cp)).toEqual([0xe4d1]);
  });

  it('widens the note’s column so the following one moves right', () => {
    const xs = (breath: boolean): number[] =>
      boxes(
        layoutScore(
          score(
            { clef: 'treble' },
            measure(
              note('C4', '8', breath ? { breath: 'comma' } : {}),
              note('D4', '8'),
              note('E4', 'h.'),
            ),
          ),
        ),
      )
        .sort((a, b) => a.tick - b.tick)
        .map((b) => b.x);

    const withMark = xs(true);
    const without = xs(false);
    expect(withMark[0]).toBeCloseTo(without[0]!, 6); // the marked note itself does not move
    expect(withMark[1]!).toBeGreaterThan(without[1]!);
  });
});

describe('diagnostics', () => {
  it('carries normalize and temporal diagnostics through, and flags a second voice', () => {
    const layout = layoutScore({
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
              voices: [voice(0, note('C4', 'q')), voice(1, note('E4', 'q'))],
            },
          ],
        },
      ],
    });
    const codes = layout.diagnostics.map((d) => d.code);

    expect(codes).toContain('measure-underfull'); // temporal
    expect(codes).toContain('voice-1-not-yet-supported');
    // Voice 1 is not laid out at all.
    expect(boxes(layout).every((b) => b.voice === 0)).toBe(true);
  });

  it('never throws on a malformed document', () => {
    expect(() => layoutScore(undefined as never)).not.toThrow();
    expect(() => layoutScore({} as never)).not.toThrow();
    expect(layoutScore({} as never).systems).toEqual([]);
  });
});

describe('timemap', () => {
  it('mirrors ElementBox addressing and defaults to 120bpm', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(chord([note('C4', 'h'), note('E4', 'h')]), note('G4', 'h')),
      ),
    );
    const tm = layout.timemap;

    expect(tm.divisions).toBe(3360);
    expect(tm.entries).toHaveLength(2);
    expect(tm.entries[0]!.ids).toHaveLength(2);
    expect(tm.entries[0]!.midiNotes).toEqual([60, 64]);
    expect(tm.entries[1]!.midi).toBe(67);
    // Every id in the timemap resolves to a rendered ElementBox.
    for (const entry of tm.entries) {
      for (const id of entry.ids) expect(layout.elements[id]).toBeDefined();
    }
    // 120bpm quarter -> a half note is one second.
    expect(tm.tickToSeconds(6720)).toBeCloseTo(1, 6);
    expect(tm.secondsToTick(1)).toBeCloseTo(6720, 6);
    expect(tm.activeAt(0)).toEqual(tm.entries[0]!.ids);
    expect(tm.byId(tm.entries[1]!.ids[0]!)).toBe(tm.entries[1]);
    const position = tm.positionAtTick(0)!;
    expect(position.systemIndex).toBe(0);
    expect(position.x).toBeCloseTo(tm.entries[0]!.x, 6);
    expect(position.yBottom - position.yTop).toBe(4);
  });

  it('merges a tie into one entry', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure(note('C4', 'h'), note('C4', 'h', { tie: 'start' })),
        measure(note('C4', 'h', { tie: 'stop' }), note('D4', 'h')),
      ),
    );
    const tm = layout.timemap;

    expect(tm.entries).toHaveLength(3);
    expect(tm.entries[1]!.durationTicks).toBe(13440); // two halves, one entry
    expect(tm.measures.map((m) => [m.startTick, m.endTick])).toEqual([
      [0, 13440],
      [13440, 26880],
    ]);
  });

  it('follows a custom tempo map', () => {
    const doc = score(
      { clef: 'treble', tempo: [{ tick: 0, bpm: 60 }] },
      measure(note('C4', 'w')),
    );
    expect(layoutScore(doc).timemap.tickToSeconds(3360)).toBeCloseTo(1, 6);
  });
});

describe('purity and glyph coverage', () => {
  it('is deterministic — the same ScoreDoc lays out identically twice', () => {
    const doc = score(
      { clef: 'bass', key: -3 },
      measure(note('E2', 'q'), chord([note('G2', 'q'), note('Bb2', 'q')]), note('C3', 'h')),
    );
    const a = layoutScore(doc);
    const b = layoutScore(doc);
    expect(JSON.stringify({ g: b.glyphs, r: b.rects, e: b.elements })).toBe(
      JSON.stringify({ g: a.glyphs, r: a.rects, e: a.elements }),
    );
  });

  it('resolves every emitted glyph to a real codepoint', () => {
    const layout = layoutScore(
      score(
        { clef: 'alto', key: 4, time: { beats: 6, beatType: 8 } },
        measure({ barlineStart: 'repeat-start', barlineEnd: 'repeat-end' },
          note('C4', '8.'), note('D4', '16'), note('E4', 'q'), note('F4', 'q')),
      ),
    );
    expect(layout.glyphs.length).toBeGreaterThan(0);
    expect(layout.glyphs.every((g) => g.cp >= 0xe000)).toBe(true);
  });
});

describe('viewBox', () => {
  it('covers every system', () => {
    const layout = layoutScore(
      score(
        { clef: 'treble' },
        measure({ systemBreak: true }, note('C4', 'w')),
        measure(note('D4', 'w')),
      ),
    );
    const last = layout.systems[layout.systems.length - 1]!;
    expect(layout.viewBox.h).toBeGreaterThanOrEqual(last.y + last.h);
    expect(layout.viewBox.w).toBeGreaterThanOrEqual(
      Math.max(...layout.systems.map((s) => s.w)),
    );
  });
});

/** Every id the layout addresses is a real `NoteId` from the document. */
export type _ = NoteId;

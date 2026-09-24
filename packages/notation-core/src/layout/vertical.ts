// Pipeline stage 5 — vertical (architecture.md, engraving.md "## Stems", "## Rests",
// "## Ledger lines", "## Accidentals").
//
// Staff position, stem direction and length, ledger lines, chord second-shifting,
// accidental packing and rest anchors — everything that is a function of pitch and not
// of x. All measurements come from the font metadata; nothing here is a magic constant
// except the engraving heuristics called out by name below.
//
// Voice 0 only: two-voice layout (forced stem directions, ±1sp rest offsets, shared
// columns) is a later slice, and a voice 1 with content raises a diagnostic instead of
// being laid out half-correctly.

import { engravingDefaults, glyphAdvanceWidth, glyphAnchor, glyphBBox } from '../font/metadata.js';
import type { NotationOptions } from '../model/options.js';
import type {
  Diagnostic,
  Duration,
  DurationBase,
  NoteEl,
  NoteId,
  Pitch,
  RestEl,
} from '../model/types.js';
import { accidentalOf, notesOf, type AccidentalScore } from './accidentals.js';
import type { NormalizedMeasure, NormalizedScore } from './normalize.js';
import { MIDDLE_LINE, staffPositionOf } from './staff.js';
import type { TemporalElement, TemporalScore } from './temporal.js';

/** 3.5sp from the notehead centre (engraving.md "## Stems" step 2). */
export const STEM_LENGTH = 3.5;

// Spacing heuristics — engraving.md fixes the 0.2sp accidental-stacking pad and leaves
// the rest to the implementation.
const ACCIDENTAL_GAP = 0.16; // accidental block to notehead
const ACCIDENTAL_COLUMN_GAP = 0.12; // between stacked accidental columns
const ACCIDENTAL_PAD = 0.2; // vertical clearance in the stacking bbox test
const DOT_GAP = 0.2; // notehead/rest to first augmentation dot
const DOT_SPACING = 0.1; // between successive dots

const NOTEHEAD_GLYPH: Record<DurationBase, string> = {
  breve: 'noteheadDoubleWhole',
  whole: 'noteheadWhole',
  half: 'noteheadHalf',
  quarter: 'noteheadBlack',
  eighth: 'noteheadBlack',
  '16th': 'noteheadBlack',
  '32nd': 'noteheadBlack',
  '64th': 'noteheadBlack',
};

const REST_GLYPH: Record<DurationBase, string> = {
  breve: 'restDoubleWhole',
  whole: 'restWhole',
  half: 'restHalf',
  quarter: 'restQuarter',
  eighth: 'rest8th',
  '16th': 'rest16th',
  '32nd': 'rest32nd',
  '64th': 'rest64th',
};

const FLAG_GLYPH: Partial<Record<DurationBase, readonly [string, string]>> = {
  eighth: ['flag8thUp', 'flag8thDown'],
  '16th': ['flag16thUp', 'flag16thDown'],
  '32nd': ['flag32ndUp', 'flag32ndDown'],
  '64th': ['flag64thUp', 'flag64thDown'],
};

const STEMLESS: ReadonlySet<DurationBase> = new Set<DurationBase>(['breve', 'whole']);

export interface AccidentalLayout {
  glyph: string;
  parenthesized: boolean;
  /** Offset from the element's notehead x — always negative (accidentals sit left). */
  dx: number;
  y: number;
  width: number;
}

export interface NoteheadLayout {
  id: NoteId;
  pitch: Pitch;
  /** 0 = top staff line, 4 = bottom, y increases downward (architecture.md). */
  staffPosition: number;
  glyph: string;
  width: number;
  /** Chord second-shift: one notehead width right of the stem, or 0 (engraving.md). */
  dx: number;
  accidental?: AccidentalLayout;
  /** Integer staff positions needing a ledger line, this notehead's own included. */
  ledgerLines: readonly number[];
  /** Augmentation dot centres, relative to the element's notehead x. */
  dots: readonly { dx: number; y: number }[];
}

export interface StemLayout {
  dir: 1 | -1; // 1 = up (toward smaller y), -1 = down
  /** Left edge of the stem rect, relative to the element's notehead x. */
  dx: number;
  width: number;
  yTop: number;
  yBottom: number;
  /** Absent when `stem: 'none'` or the duration carries no stem. */
  drawn: boolean;
  flag?: { glyph: string; dx: number; y: number };
}

export interface RestLayout {
  glyph: string;
  y: number;
  width: number;
  wholeBar: boolean;
  dots: readonly { dx: number; y: number }[];
}

export interface VerticalElement {
  id: NoteId;
  kind: 'note' | 'chord' | 'rest';
  source: TemporalElement;
  staffIndex: number;
  measureIndex: number;
  voice: 0 | 1;
  tick: number;
  measureTick: number;
  durationTicks: number;
  duration: Duration;
  noteheads: readonly NoteheadLayout[];
  rest?: RestLayout;
  stem?: StemLayout;
  /** Accidental block width, left of the notehead x. */
  leftWidth: number;
  /** Notehead advance + chord shift + dots, right of the notehead x. */
  rightWidth: number;
}

export interface VerticalScore {
  elements: readonly VerticalElement[];
  diagnostics: readonly Diagnostic[];
}

export function vertical(
  normalized: NormalizedScore,
  score: TemporalScore,
  resolved: AccidentalScore,
  _options?: NotationOptions,
): VerticalScore {
  const diagnostics: Diagnostic[] = [];
  const elements: VerticalElement[] = [];

  for (const staff of normalized.staves) {
    for (const measure of staff.measures) {
      reportVoiceOne(measure, score, staff.index, diagnostics);
      const rows = score.elements
        .filter(
          (e) => e.staffIndex === staff.index && e.measureIndex === measure.index && e.voice === 0,
        )
        .sort((a, b) => a.tick - b.tick);
      for (const row of rows) elements.push(layOut(row, measure, resolved));
    }
  }

  return { elements, diagnostics };
}

function reportVoiceOne(
  measure: NormalizedMeasure,
  score: TemporalScore,
  staffIndex: number,
  diagnostics: Diagnostic[],
): void {
  const hasVoiceOne = score.elements.some(
    (e) => e.staffIndex === staffIndex && e.measureIndex === measure.index && e.voice === 1,
  );
  if (!hasVoiceOne) return;
  diagnostics.push({
    severity: 'warning',
    code: 'voice-1-not-yet-supported',
    message: `Measure ${measure.index} has a second voice; only voice 0 is laid out.`,
    measureIndex: measure.index,
    voice: 1,
  });
}

function layOut(
  row: TemporalElement,
  measure: NormalizedMeasure,
  resolved: AccidentalScore,
): VerticalElement {
  const duration = row.element.duration;
  const base: Omit<VerticalElement, 'noteheads' | 'leftWidth' | 'rightWidth'> = {
    id: row.id,
    kind: row.kind,
    source: row,
    staffIndex: row.staffIndex,
    measureIndex: row.measureIndex,
    voice: row.voice,
    tick: row.tick,
    measureTick: row.measureTick,
    durationTicks: row.durationTicks,
    duration,
  };

  if (row.kind === 'rest') {
    const rest = layOutRest(row.element as RestEl, duration);
    return {
      ...base,
      noteheads: [],
      rest,
      leftWidth: 0,
      rightWidth: rest.width + dotsWidth(duration.dots),
    };
  }

  const notes = notesOf(row);
  const glyph = NOTEHEAD_GLYPH[duration.base] ?? 'noteheadBlack';
  const width = glyphAdvanceWidth(glyph);
  const heads = notes.map((note) => ({
    note,
    staffPosition: staffPositionOf(note.pitch, measure.clef),
  }));

  const dir = stemDirection(heads, notes);
  const shifts = secondShifts(heads, width);

  const noteheads: NoteheadLayout[] = heads.map((head, i) => {
    const dx = shifts[i] ?? 0;
    const acc = accidentalOf(resolved, head.note.id);
    return {
      id: head.note.id,
      pitch: head.note.pitch,
      staffPosition: head.staffPosition,
      glyph,
      width,
      dx,
      ledgerLines: ledgerLines(head.staffPosition),
      dots: [],
      ...(acc.glyph
        ? {
            accidental: {
              glyph: acc.glyph,
              parenthesized: acc.parenthesized,
              dx: 0, // filled in by packAccidentals
              y: head.staffPosition,
              width: glyphAdvanceWidth(acc.glyph),
            },
          }
        : {}),
    } satisfies NoteheadLayout;
  });

  const leftWidth = packAccidentals(noteheads);
  const headExtent = noteheads.reduce((max, n) => Math.max(max, n.dx + n.width), 0);
  for (const head of noteheads) head.dots = dotPositions(duration.dots, headExtent, head.staffPosition);

  const stem = layOutStem(duration, dir, noteheads, notes);

  return {
    ...base,
    noteheads,
    ...(stem ? { stem } : {}),
    leftWidth,
    rightWidth: headExtent + dotsWidth(duration.dots),
  };
}

// --- rests ------------------------------------------------------------------

/**
 * Rest anchors, verified against the Bravura metadata rather than taken from
 * engraving.md's own (self-flagged as unconfirmed) numbers:
 *
 * - `restWhole` has bBox y -0.54..0.036 — it hangs *below* its origin, so the origin is
 *   the line it hangs from: y = 1.0, the line above the middle one. engraving.md's
 *   y = 1.5 would hang it from the middle of a space.
 * - `restDoubleWhole` has bBox y 0..1.0 — it sits *above* its origin and fills exactly
 *   one space, so y = 2.0 (the middle line) puts it in the space above, which is the
 *   convention. engraving.md groups it with the whole rest at 1.5; the metadata does not
 *   agree.
 * - every other rest is centred on, or sits on, its origin, so the middle-line baseline
 *   y = 2.0 from engraving.md is right for them.
 */
const REST_Y: Partial<Record<DurationBase, number>> = {
  whole: 1.0,
};
const REST_BASELINE = MIDDLE_LINE;

function layOutRest(el: RestEl, duration: Duration): RestLayout {
  // A `wholeBar` rest always draws the single whole-rest glyph, whatever the meter
  // (data-model.md); its tick length diverging from its `Duration` is the temporal
  // stage's business, not this one's.
  const glyph = el.wholeBar ? 'restWhole' : (REST_GLYPH[duration.base] ?? 'restQuarter');
  const y =
    el.staffPosition ??
    (el.wholeBar ? REST_Y.whole! : (REST_Y[duration.base] ?? REST_BASELINE));
  const width = glyphAdvanceWidth(glyph);
  return {
    glyph,
    y,
    width,
    wholeBar: el.wholeBar === true,
    dots: el.wholeBar ? [] : dotPositions(duration.dots, width, y),
  };
}

// --- stems ------------------------------------------------------------------

interface Head {
  note: NoteEl;
  staffPosition: number;
}

/**
 * engraving.md "## Stems" step 1: below the middle line stems up, above stems down, on
 * it down by convention. A chord votes by the member furthest from the middle line; a
 * chord straddling it symmetrically falls back to the same down convention.
 */
function stemDirection(heads: readonly Head[], notes: readonly NoteEl[]): 1 | -1 {
  const override = notes.find((n) => n.stem === 'up' || n.stem === 'down');
  if (override) return override.stem === 'up' ? 1 : -1;

  let furthest = 0;
  for (const head of heads) furthest = Math.max(furthest, Math.abs(head.staffPosition - MIDDLE_LINE));
  const extremes = heads.filter(
    (h) => Math.abs(Math.abs(h.staffPosition - MIDDLE_LINE) - furthest) < 1e-9,
  );
  const below = extremes.some((h) => h.staffPosition > MIDDLE_LINE);
  const above = extremes.some((h) => h.staffPosition < MIDDLE_LINE);
  if (below && !above) return 1;
  return -1;
}

/** engraving.md "## Stems" step 4 — a member a step above an unshifted one moves a
 *  notehead width right of the stem; the lower of the pair stays left. */
function secondShifts(heads: readonly Head[], width: number): number[] {
  const order = heads
    .map((head, index) => ({ index, position: head.staffPosition }))
    .sort((a, b) => b.position - a.position); // bottom (largest y) upward
  const shifts = new Array<number>(heads.length).fill(0);
  let previous: number | undefined;
  let previousShifted: boolean = false;
  for (const entry of order) {
    const isSecond: boolean =
      previous !== undefined && Math.abs(previous - entry.position - 0.5) < 1e-9;
    const shift: boolean = isSecond && !previousShifted;
    shifts[entry.index] = shift ? width : 0;
    previousShifted = shift;
    previous = entry.position;
  }
  return shifts;
}

function layOutStem(
  duration: Duration,
  dir: 1 | -1,
  noteheads: readonly NoteheadLayout[],
  notes: readonly NoteEl[],
): StemLayout | undefined {
  if (STEMLESS.has(duration.base) || noteheads.length === 0) return undefined;
  const glyph = noteheads[0]!.glyph;
  const thickness = stemThickness();
  const top = Math.min(...noteheads.map((n) => n.staffPosition));
  const bottom = Math.max(...noteheads.map((n) => n.staffPosition));
  const anchor = glyphAnchor(glyph, dir === 1 ? 'stemUpSE' : 'stemDownNW');
  // SMuFL anchors are y-up; layout y is y-down, hence the sign flip.
  const attachX = anchor ? anchor[0] : dir === 1 ? noteheads[0]!.width : 0;
  const attachY = anchor ? -anchor[1] : 0;

  const yTop = dir === 1 ? top - STEM_LENGTH : top + attachY;
  const yBottom = dir === 1 ? bottom + attachY : bottom + STEM_LENGTH;
  const dx = dir === 1 ? attachX - thickness : attachX;
  const drawn = !notes.some((n) => n.stem === 'none');

  const flagPair = FLAG_GLYPH[duration.base];
  const flag = flagPair
    ? {
        glyph: dir === 1 ? flagPair[0] : flagPair[1],
        dx,
        y: dir === 1 ? yTop : yBottom,
      }
    : undefined;

  return { dir, dx, width: thickness, yTop, yBottom, drawn, ...(flag ? { flag } : {}) };
}

function stemThickness(): number {
  return engravingDefaults.stemThickness;
}

// --- ledger lines, dots, accidental packing ---------------------------------

/** engraving.md "## Ledger lines": every integer position between the staff edge and
 *  the notehead, plus the notehead's own line when it lands on one. */
function ledgerLines(staffPosition: number): number[] {
  const lines: number[] = [];
  if (staffPosition < 0) {
    for (let y = -1; y >= staffPosition - 1e-9; y -= 1) lines.push(y);
  } else if (staffPosition > 4) {
    for (let y = 5; y <= staffPosition + 1e-9; y += 1) lines.push(y);
  }
  return lines;
}

/** A dot never renders on a staff line: nudge it up half a space when its notehead
 *  sits on one (engraving.md "## Horizontal spacing"). */
function dotPositions(
  dots: 0 | 1 | 2,
  fromX: number,
  y: number,
): { dx: number; y: number }[] {
  if (!dots) return [];
  const width = glyphAdvanceWidth('augmentationDot');
  const onLine = Math.abs(y - Math.round(y)) < 1e-9;
  const dotY = onLine ? y - 0.5 : y;
  const out: { dx: number; y: number }[] = [];
  for (let i = 0; i < dots; i += 1) {
    out.push({ dx: fromX + DOT_GAP + i * (width + DOT_SPACING), y: dotY });
  }
  return out;
}

function dotsWidth(dots: 0 | 1 | 2): number {
  if (!dots) return 0;
  const width = glyphAdvanceWidth('augmentationDot');
  return DOT_GAP + dots * width + (dots - 1) * DOT_SPACING;
}

/**
 * engraving.md "## Accidentals" chord stacking: top-down by staff position, greedy-pack
 * into the leftmost column that does not vertically overlap (bbox test, ~0.2sp pad)
 * anything already there. Returns the block width, which feeds the column rod.
 */
function packAccidentals(noteheads: readonly NoteheadLayout[]): number {
  const withAccidental = noteheads
    .filter((n) => n.accidental)
    .sort((a, b) => a.staffPosition - b.staffPosition);
  if (withAccidental.length === 0) return 0;

  const columns: { top: number; bottom: number }[][] = [];
  const assigned: { head: NoteheadLayout; column: number }[] = [];

  for (const head of withAccidental) {
    const acc = head.accidental!;
    const bbox = glyphBBox(acc.glyph);
    const span = {
      top: acc.y - bbox.bBoxNE[1] - ACCIDENTAL_PAD,
      bottom: acc.y - bbox.bBoxSW[1] + ACCIDENTAL_PAD,
    };
    let column = 0;
    while (
      columns[column]?.some((placed) => span.top < placed.bottom && placed.top < span.bottom)
    ) {
      column += 1;
    }
    (columns[column] ??= []).push(span);
    assigned.push({ head, column });
  }

  const widths = columns.map((_, i) =>
    assigned
      .filter((a) => a.column === i)
      .reduce((max, a) => Math.max(max, a.head.accidental!.width), 0),
  );

  for (const { head, column } of assigned) {
    let right = -ACCIDENTAL_GAP;
    for (let i = 0; i < column; i += 1) right -= widths[i]! + ACCIDENTAL_COLUMN_GAP;
    head.accidental!.dx = right - head.accidental!.width;
  }

  return (
    ACCIDENTAL_GAP +
    widths.reduce((sum, w) => sum + w, 0) +
    Math.max(0, widths.length - 1) * ACCIDENTAL_COLUMN_GAP
  );
}

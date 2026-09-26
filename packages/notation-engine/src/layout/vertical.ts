// Pipeline stage 5 — vertical (architecture.md, engraving.md "## Stems", "## Rests",
// "## Ledger lines", "## Accidentals").
//
// Staff position, stem direction and length, ledger lines, chord second-shifting,
// accidental packing and rest anchors — everything that is a function of pitch and not
// of x. All measurements come from the font metadata; nothing here is a magic constant
// except the engraving heuristics called out by name below.

import { engravingDefaults, glyphAdvanceWidth, glyphAnchor, glyphBBox } from '../font/metadata.js';
import type { NotationOptions } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import type { ClefSpec, Duration, DurationBase, NoteId, Pitch } from './records.js';
import { accidentalOf, type AccidentalScore } from './accidentals.js';
import type { NormalizedMeasure, NormalizedScore } from './normalize.js';
import { MIDDLE_LINE, staffPositionOf } from './staff.js';
import type { ElementNote, TemporalElement, TemporalScore } from './temporal.js';

/** 3.5sp from the notehead centre (engraving.md "## Stems" step 2). */
export const STEM_LENGTH = 3.5;

// Spacing heuristics — engraving.md fixes the 0.2sp accidental-stacking pad and leaves
// the rest to the implementation.
const ACCIDENTAL_GAP = 0.16; // accidental block to notehead
const ACCIDENTAL_COLUMN_GAP = 0.12; // between stacked accidental columns
const ACCIDENTAL_PAD = 0.2; // vertical clearance in the stacking bbox test
const DOT_GAP = 0.2; // notehead/rest to first augmentation dot
const DOT_SPACING = 0.1; // between successive dots
const BREATH_GAP = 0.35; // right edge of the note (dots included) to a breath mark

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

export interface BreathLayout {
  glyph: string;
  /** Offset from the element's notehead x — the mark sits past the notehead and dots. */
  dx: number;
  y: number;
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
  breath?: BreathLayout;
  /** Accidental block width, left of the notehead x. */
  leftWidth: number;
  /** Notehead advance + chord shift + dots + breath mark, right of the notehead x. */
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
  const twoVoice = twoVoiceMeasures(score);
  const upVoice = computeUpVoice(normalized, score, twoVoice);
  const elementBeam = beamDirectionsByElement(normalized, score, twoVoice, upVoice, diagnostics);

  for (const staff of normalized.staves) {
    for (const measure of staff.measures) {
      const rows = score.elements
        .filter((e) => e.staffIndex === staff.index && e.measureIndex === measure.index)
        .sort((a, b) => a.tick - b.tick || a.voice - b.voice);
      const key = measureKey(staff.index, measure.index);
      const shared = twoVoice.has(key);
      const laidOut = rows.map((row) =>
        layOut(row, measure, resolved, shared, upVoice.get(key) ?? 0, elementBeam.get(row.id)),
      );
      if (shared) {
        resolveSharedTicks(laidOut);
        resolveSharedRests(laidOut, upVoice.get(key) ?? 0);
      }
      elements.push(...laidOut);
    }
  }

  return { elements, diagnostics };
}

function measureKey(staffIndex: number, measureIndex: number): string {
  return `${staffIndex}:${measureIndex}`;
}

function twoVoiceMeasures(score: TemporalScore): Set<string> {
  const keys = new Set<string>();
  for (const el of score.elements) {
    if (el.voice === 1) keys.add(measureKey(el.staffIndex, el.measureIndex));
  }
  return keys;
}

function voiceDirection(voice: 0 | 1, upVoice: 0 | 1): 1 | -1 {
  return voice === upVoice ? 1 : -1;
}

function buildClefByMeasure(normalized: NormalizedScore): Map<number, ClefSpec> {
  const clefByMeasure = new Map<number, ClefSpec>();
  for (const staff of normalized.staves) {
    for (const measure of staff.measures) clefByMeasure.set(measure.index, measure.clef);
  }
  return clefByMeasure;
}

function computeUpVoice(
  normalized: NormalizedScore,
  score: TemporalScore,
  twoVoice: ReadonlySet<string>,
): Map<string, 0 | 1> {
  const clefByMeasure = buildClefByMeasure(normalized);
  const totals = new Map<string, [number, number, number, number]>();
  for (const el of score.elements) {
    if (el.kind === 'rest') continue;
    const key = measureKey(el.staffIndex, el.measureIndex);
    if (!twoVoice.has(key)) continue;
    const clef = clefByMeasure.get(el.measureIndex) ?? { kind: 'treble' as const };
    const entry = totals.get(key) ?? [0, 0, 0, 0];
    for (const note of el.notes) {
      const pos = staffPositionOf(note.pitch, clef);
      if (el.voice === 0) {
        entry[0] += pos;
        entry[1] += 1;
      } else {
        entry[2] += pos;
        entry[3] += 1;
      }
    }
    totals.set(key, entry);
  }
  const result = new Map<string, 0 | 1>();
  for (const [key, [sum0, count0, sum1, count1]] of totals) {
    if (count0 === 0 && count1 === 0) continue;
    const mean0 = count0 > 0 ? sum0 / count0 : Infinity;
    const mean1 = count1 > 0 ? sum1 / count1 : Infinity;
    result.set(key, mean0 <= mean1 ? 0 : 1);
  }
  return result;
}

interface BeamMembership {
  beamId: string;
  dir: 1 | -1;
}

function beamDirectionsByElement(
  normalized: NormalizedScore,
  score: TemporalScore,
  twoVoice: ReadonlySet<string>,
  upVoice: ReadonlyMap<string, 0 | 1>,
  diagnostics: Diagnostic[],
): Map<NoteId, BeamMembership> {
  const clefByMeasure = buildClefByMeasure(normalized);
  const byId = new Map<NoteId, TemporalElement>();
  for (const el of score.elements) byId.set(el.id, el);

  const result = new Map<NoteId, BeamMembership>();
  for (const beam of normalized.beams) {
    const notes = beam.elements
      .map((id) => byId.get(id))
      .filter((el): el is TemporalElement => el !== undefined && el.kind !== 'rest');
    if (notes.length === 0) continue;

    const overrides = notes
      .map((el) => el.stem)
      .filter((s): s is 'up' | 'down' => s === 'up' || s === 'down');

    let dir: 1 | -1;
    if (overrides.length > 0) {
      const first = overrides[0]!;
      if (overrides.some((o) => o !== first)) {
        diagnostics.push({
          severity: 'warning',
          code: 'mnx-unsupported',
          message: 'mixed stem directions in a beam',
          measureIndex: beam.measureIndex,
          voice: beam.voice,
        });
      }
      dir = first === 'up' ? 1 : -1;
    } else if (twoVoice.has(measureKey(notes[0]!.staffIndex, beam.measureIndex))) {
      dir = voiceDirection(beam.voice, upVoice.get(measureKey(notes[0]!.staffIndex, beam.measureIndex)) ?? 0);
    } else {
      const clef = clefByMeasure.get(beam.measureIndex) ?? { kind: 'treble' as const };
      let furthest = 0;
      let below = false;
      let above = false;
      for (const el of notes) {
        for (const note of el.notes) {
          const pos = staffPositionOf(note.pitch, clef);
          const dist = Math.abs(pos - MIDDLE_LINE);
          if (dist > furthest + 1e-9) {
            furthest = dist;
            below = pos > MIDDLE_LINE;
            above = pos < MIDDLE_LINE;
          } else if (Math.abs(dist - furthest) < 1e-9) {
            below = below || pos > MIDDLE_LINE;
            above = above || pos < MIDDLE_LINE;
          }
        }
      }
      dir = below && !above ? 1 : -1;
    }

    for (const id of beam.elements) result.set(id, { beamId: beam.id, dir });
  }
  return result;
}

function layOut(
  row: TemporalElement,
  measure: NormalizedMeasure,
  resolved: AccidentalScore,
  shared: boolean,
  upVoice: 0 | 1,
  beamInfo?: BeamMembership,
): VerticalElement {
  const duration: Duration = {
    base: row.base,
    dots: row.dots,
    ...(row.tuplet ? { tuplet: row.tuplet } : {}),
  };
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
    const rest = layOutRest(row, duration, shared, upVoice);
    return {
      ...base,
      noteheads: [],
      rest,
      leftWidth: 0,
      rightWidth: rest.width + dotsWidth(duration.dots),
    };
  }

  const notes = row.notes;
  const glyph = NOTEHEAD_GLYPH[duration.base] ?? 'noteheadBlack';
  const width = glyphAdvanceWidth(glyph);
  const heads = notes.map((note) => ({
    note,
    staffPosition: staffPositionOf(note.pitch, measure.clef),
  }));

  const dir = beamInfo
    ? beamInfo.dir
    : shared && row.stem !== 'up' && row.stem !== 'down'
      ? voiceDirection(row.voice, upVoice)
      : stemDirection(heads, row.stem);
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
  const stem = layOutStem(duration, dir, noteheads, row.stem, beamInfo !== undefined);
  const element: VerticalElement = {
    ...base,
    noteheads,
    ...(stem ? { stem } : {}),
    leftWidth,
    rightWidth: 0,
  };
  placeRight(element, headExtent(noteheads), shared);
  return element;
}

function headExtent(noteheads: readonly NoteheadLayout[]): number {
  return noteheads.reduce((max, n) => Math.max(max, n.dx + n.width), 0);
}

function placeRight(element: VerticalElement, extent: number, shared: boolean): void {
  const { dots } = element.duration;
  const below = shared && element.voice === 1;
  for (const head of element.noteheads) {
    head.dots = dotPositions(dots, extent, head.staffPosition, below);
  }
  const noteRight = extent + dotsWidth(dots);
  const breath = layOutBreath(element.source.breath, noteRight);
  if (breath) element.breath = breath;
  element.rightWidth = noteRight + (breath ? BREATH_GAP + glyphAdvanceWidth(breath.glyph) : 0);
}

function resolveSharedTicks(elements: readonly VerticalElement[]): void {
  const byTick = new Map<number, VerticalElement[]>();
  for (const el of elements) {
    if (el.noteheads.length === 0) continue;
    const bucket = byTick.get(el.tick);
    if (bucket) bucket.push(el);
    else byTick.set(el.tick, [el]);
  }

  for (const group of byTick.values()) {
    const upper = group.find((e) => e.voice === 0);
    const lower = group.find((e) => e.voice === 1);
    if (!upper || !lower) continue;

    const shift = crossVoiceShift(upper, lower);
    if (shift) shiftElement(shift.element, shift.by);

    const extent = Math.max(...group.map((e) => headExtent(e.noteheads)));
    for (const el of group) placeRight(el, extent, true);

    const leftWidth = packAccidentals(group.flatMap((e) => e.noteheads));
    for (const el of group) el.leftWidth = leftWidth;
  }
}

function restRange(el: VerticalElement): [number, number] {
  const bbox = glyphBBox(el.rest!.glyph);
  return [el.rest!.y - bbox.bBoxNE[1], el.rest!.y - bbox.bBoxSW[1]];
}

function noteRange(el: VerticalElement): [number, number] {
  let top = Infinity;
  let bottom = -Infinity;
  for (const head of el.noteheads) {
    const bbox = glyphBBox(head.glyph);
    top = Math.min(top, head.staffPosition - bbox.bBoxNE[1]);
    bottom = Math.max(bottom, head.staffPosition - bbox.bBoxSW[1]);
  }
  if (el.stem) {
    top = Math.min(top, el.stem.yTop);
    bottom = Math.max(bottom, el.stem.yBottom);
  }
  return [top, bottom];
}

function rangesOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function clearRest(el: VerticalElement, avoid: readonly [number, number][], dir: 1 | -1): void {
  const rest = el.rest!;
  const bbox = glyphBBox(rest.glyph);
  const topOffset = -bbox.bBoxNE[1];
  const bottomOffset = -bbox.bBoxSW[1];
  let y = rest.y;
  let moved = false;
  for (let guard = 0; guard < 40; guard += 1) {
    const range: [number, number] = [y + topOffset, y + bottomOffset];
    if (!avoid.some((a) => rangesOverlap(range, a))) break;
    y += dir * 0.25;
    moved = true;
  }
  if (moved) y = dir === -1 ? Math.floor(y) : Math.ceil(y);
  rest.y = y;
  rest.dots = dotPositions(rest.dots.length as 0 | 1 | 2, rest.width, y, false);
}

function symmetricClearRests(upEl: VerticalElement, downEl: VerticalElement): void {
  const upBBox = glyphBBox(upEl.rest!.glyph);
  const downBBox = glyphBBox(downEl.rest!.glyph);
  const upBottomOffset = -upBBox.bBoxSW[1];
  const downTopOffset = -downBBox.bBoxNE[1];
  let upY = upEl.rest!.y;
  let downY = downEl.rest!.y;
  let moved = false;
  for (let guard = 0; guard < 40; guard += 1) {
    if (upY + upBottomOffset <= downY + downTopOffset) break;
    upY -= 0.25;
    downY += 0.25;
    moved = true;
  }
  if (moved) {
    upY = Math.floor(upY);
    downY = Math.ceil(downY);
  }
  upEl.rest!.y = upY;
  upEl.rest!.dots = dotPositions(upEl.rest!.dots.length as 0 | 1 | 2, upEl.rest!.width, upY, false);
  downEl.rest!.y = downY;
  downEl.rest!.dots = dotPositions(downEl.rest!.dots.length as 0 | 1 | 2, downEl.rest!.width, downY, false);
}

function resolveSharedRests(elements: readonly VerticalElement[], upVoice: 0 | 1): void {
  const byTick = new Map<number, VerticalElement[]>();
  for (const el of elements) {
    const bucket = byTick.get(el.tick);
    if (bucket) bucket.push(el);
    else byTick.set(el.tick, [el]);
  }

  for (const group of byTick.values()) {
    const upper = group.find((e) => e.voice === 0);
    const lower = group.find((e) => e.voice === 1);
    if (!upper || !lower) continue;
    const [upEl, downEl] = upVoice === 0 ? [upper, lower] : [lower, upper];
    const upFree = upEl.rest && upEl.source.staffPosition === undefined;
    const downFree = downEl.rest && downEl.source.staffPosition === undefined;

    if (upEl.rest && downEl.rest && upFree && downFree) {
      symmetricClearRests(upEl, downEl);
      continue;
    }
    if (upFree) clearRest(upEl, [downEl.rest ? restRange(downEl) : noteRange(downEl)], -1);
    if (downFree) clearRest(downEl, [upEl.rest ? restRange(upEl) : noteRange(upEl)], 1);
  }
}

function crossVoiceShift(
  upper: VerticalElement,
  lower: VerticalElement,
): { element: VerticalElement; by: number } | undefined {
  const pairs = upper.noteheads.flatMap((a) => lower.noteheads.map((b) => [a, b] as const));
  const apart = (a: NoteheadLayout, b: NoteheadLayout): number =>
    Math.abs(a.staffPosition - b.staffPosition);

  if (pairs.some(([a, b]) => Math.abs(apart(a, b) - 0.5) < 1e-9)) {
    return { element: upper, by: headExtent(lower.noteheads) };
  }
  const unisons = pairs.filter(([a, b]) => apart(a, b) < 1e-9);
  if (unisons.length === 0) return undefined;
  const identical =
    upper.duration.dots === lower.duration.dots && unisons.every(([a, b]) => a.glyph === b.glyph);
  if (identical) return undefined;
  return { element: lower, by: headExtent(upper.noteheads) };
}

function shiftElement(element: VerticalElement, by: number): void {
  for (const head of element.noteheads) head.dx += by;
  if (element.stem) {
    element.stem.dx += by;
    if (element.stem.flag) element.stem.flag.dx += by;
  }
}

// --- breath marks -----------------------------------------------------------

const BREATH_GLYPH: Record<NonNullable<TemporalElement['breath']>, string> = {
  comma: 'breathMarkComma',
  caesura: 'caesura',
};

/**
 * Breath marks are anchored on the top staff line, y = 0. Taken from the real glyph
 * metadata rather than assumed, the same way the rest anchors above were:
 * `breathMarkComma` has bBox y 0.008..1.004 and `caesura` -0.004..2.128 — both start at
 * their origin and extend upward only, so anchoring on the top line puts all of their
 * ink in the space above the staff, which is where the convention puts them. Any lower
 * an anchor would drive them through the staff lines.
 */
const BREATH_Y = 0;

function layOutBreath(
  breath: TemporalElement['breath'],
  noteRight: number,
): BreathLayout | undefined {
  if (!breath) return undefined;
  return { glyph: BREATH_GLYPH[breath], dx: noteRight + BREATH_GAP, y: BREATH_Y };
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

function layOutRest(row: TemporalElement, duration: Duration, shared: boolean, upVoice: 0 | 1): RestLayout {
  // A `wholeBar` rest always draws the single whole-rest glyph, whatever the meter
  // (mnx.md); its tick length diverging from its `Duration` is the temporal
  // stage's business, not this one's.
  const glyph = row.wholeBar ? 'restWhole' : (REST_GLYPH[duration.base] ?? 'restQuarter');
  const anchor = row.wholeBar ? REST_Y.whole! : (REST_Y[duration.base] ?? REST_BASELINE);
  const y = row.staffPosition ?? anchor + (shared ? -voiceDirection(row.voice, upVoice) : 0);
  const width = glyphAdvanceWidth(glyph);
  return {
    glyph,
    y,
    width,
    wholeBar: row.wholeBar === true,
    dots: row.wholeBar ? [] : dotPositions(duration.dots, width, y, false),
  };
}

// --- stems ------------------------------------------------------------------

interface Head {
  note: ElementNote;
  staffPosition: number;
}

/**
 * engraving.md "## Stems" step 1: below the middle line stems up, above stems down, on
 * it down by convention. A chord votes by the member furthest from the middle line; a
 * chord straddling it symmetrically falls back to the same down convention.
 */
function stemDirection(heads: readonly Head[], override: TemporalElement['stem']): 1 | -1 {
  if (override === 'up' || override === 'down') return override === 'up' ? 1 : -1;

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
  stemOverride: TemporalElement['stem'],
  beamed: boolean,
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
  const drawn = stemOverride !== 'none';

  const flagPair = beamed ? undefined : FLAG_GLYPH[duration.base];
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

export function stemX(elementX: number, stem: StemLayout): number {
  return elementX + stem.dx;
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
  below: boolean,
): { dx: number; y: number }[] {
  if (!dots) return [];
  const width = glyphAdvanceWidth('augmentationDot');
  const onLine = Math.abs(y - Math.round(y)) < 1e-9;
  const dotY = onLine ? (below ? y + 0.5 : y - 0.5) : y;
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

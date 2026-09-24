// Pipeline stage 11 — emit (architecture.md "## LayoutResult").
//
// Flattens the placed score into render-ready primitives: glyph runs, rects, one
// `ElementBox` per addressable note, and the timemap. Nothing here computes geometry
// that an earlier stage owns — it only adds the staff origin of each system and turns
// the results into flat records.
//
// Not emitted yet, by scope: beams (stage 9), tie/slur paths (stage 10, hence
// `paths: []`) and tuplet brackets/numerals.

import { engravingDefaults, glyphAdvanceWidth, glyphBBox } from '../font/metadata.js';
import { glyphCodepoint } from '../font/glyphs.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import {
  describePitch,
  type Duration,
  type DurationBase,
  type NoteId,
  type TempoMap,
  type TimeSpec,
} from './records.js';
import type { NotationOptions } from '../options.js';
import { buildTimeMap, type MeasureTime, type Placement } from '../query/timemap.js';
import {
  KEY_GAP,
  cancelledAccidentals,
  digitsWidth,
  type HorizontalMeasure,
} from './horizontal.js';
import type { JustifiedScore } from './justify.js';
import { STAFF_HEIGHT, STAFF_LINES, clefGlyph, clefGlyphY, keySignature } from './staff.js';
import type { TemporalScore } from './temporal.js';
import type {
  Box,
  ElementBox,
  GlyphRun,
  LayoutResult,
  RectShape,
  SystemBox,
} from './types.js';
import type { NoteheadLayout, VerticalElement } from './vertical.js';

/** Room above the first staff for ledger lines, stems and flags. */
const TOP_MARGIN = 4;
const BOTTOM_MARGIN = 4;
const SIDE_MARGIN = 1;
/** Vertical gap between systems, on top of the 4sp staff itself. */
const SYSTEM_GAP = 8;

export interface EmitInput {
  justified: JustifiedScore;
  temporal: TemporalScore;
  tempo: TempoMap;
  divisions: number;
  diagnostics: readonly Diagnostic[];
}

export function emit(input: EmitInput, _options?: NotationOptions): LayoutResult {
  const glyphs: GlyphRun[] = [];
  const rects: RectShape[] = [];
  const elements: Record<string, ElementBox> = {};
  const systems: SystemBox[] = [];
  const measureTimes: MeasureTime[] = [];
  const placement = new Map<NoteId, Placement>();

  const width = Math.max(input.justified.width, 1);

  for (const system of input.justified.systems) {
    const staffTop = TOP_MARGIN + system.index * (STAFF_HEIGHT + SYSTEM_GAP);
    systems.push({ index: system.index, x: 0, y: staffTop, w: system.width, h: STAFF_HEIGHT });

    for (let line = 0; line < STAFF_LINES; line += 1) {
      rects.push(
        centeredRect(0, staffTop + line, system.width, engravingDefaults.staffLineThickness, 'staff-line'),
      );
    }

    for (const measure of system.measures) {
      emitChrome(measure, staffTop, glyphs);
      emitBarlines(measure, staffTop, glyphs, rects);
      measureTimes.push({
        index: measure.index,
        startTick: measure.startTick,
        endTick: measure.endTick,
        systemIndex: system.index,
        x: measure.x,
        w: measure.width,
      });

      const contentRight = measure.x + measure.width - measure.chrome.endBarlineWidth;
      measure.columns.forEach((column, i) => {
        const next = measure.columns[i + 1];
        const columnRight = next ? next.xStart : contentRight;
        for (const element of column.elements) {
          emitElement(element, {
            x: column.x,
            columnLeft: column.xStart,
            columnRight,
            staffTop,
            systemIndex: system.index,
            glyphs,
            rects,
            elements,
            placement,
          });
        }
      });
    }
  }

  const height =
    TOP_MARGIN +
    Math.max(1, systems.length) * STAFF_HEIGHT +
    Math.max(0, systems.length - 1) * SYSTEM_GAP +
    BOTTOM_MARGIN;

  const timemap = buildTimeMap({
    divisions: input.divisions,
    tempo: input.tempo,
    elements: input.temporal.elements.filter(
      (e) => e.voice === 0 && e.staffIndex === 0,
    ),
    placement,
    measures: measureTimes,
    systems,
  });

  return {
    version: 1,
    viewBox: { x: -SIDE_MARGIN, y: 0, w: width + 2 * SIDE_MARGIN, h: height },
    systems,
    glyphs,
    rects,
    paths: [], // ties and slurs are stage 10 — not in this slice
    elements,
    // TODO(interaction.md): `query/slots.ts` generates the slot bands from the column
    // x-ranges this stage already knows; until it lands there are no slots.
    slots: [],
    timemap,
    diagnostics: input.diagnostics,
  };
}

// --- chrome -----------------------------------------------------------------

function emitChrome(
  measure: HorizontalMeasure,
  staffTop: number,
  glyphs: GlyphRun[],
): void {
  let x = measure.x + measure.chrome.startBarlineWidth;

  if (measure.chrome.showClef) {
    glyphs.push(glyph(clefGlyph(measure.clef), x, staffTop + clefGlyphY(measure.clef), 'clef'));
    x += measure.chrome.clefWidth;
  }

  if (measure.chrome.keyWidth > 0) {
    const cancel = measure.chrome.cancelKey
      ? cancelledAccidentals(measure.chrome.cancelKey, measure.key, measure.clef)
      : [];
    for (const natural of cancel) {
      glyphs.push(glyph(natural.glyph, x, staffTop + natural.y, 'key-accidental'));
      x += glyphAdvanceWidth(natural.glyph) + KEY_GAP;
    }
    if (measure.chrome.showKey) {
      for (const acc of keySignature(measure.key, measure.clef)) {
        glyphs.push(glyph(acc.glyph, x, staffTop + acc.y, 'key-accidental'));
        x += glyphAdvanceWidth(acc.glyph) + KEY_GAP;
      }
    }
    x = measure.x + measure.chrome.startBarlineWidth + measure.chrome.clefWidth + measure.chrome.keyWidth;
  }

  if (measure.chrome.showTime) emitTimeSignature(measure.time, x, staffTop, glyphs);
}

/** engraving.md "## Time signatures": both digit groups centred on the same x, the wider
 *  one setting the column. The baselines are 1.0 and 3.0 rather than the spec's 1.5/2.5 —
 *  Bravura's digits are 2sp tall (bBox y ±1.0), not the one stave-space the spec assumes,
 *  so 1.5/2.5 would straddle the middle line instead of filling the halves. */
function emitTimeSignature(
  time: TimeSpec,
  x: number,
  staffTop: number,
  glyphs: GlyphRun[],
): void {
  if (time.symbol === 'common' || time.symbol === 'cut') {
    const name = time.symbol === 'cut' ? 'timeSigCutCommon' : 'timeSigCommon';
    glyphs.push(glyph(name, x, staffTop + 2, 'time-signature'));
    return;
  }
  const numerator = String(Math.max(0, Math.round(time.beats)));
  const denominator = String(Math.max(0, Math.round(time.beatType)));
  const blockWidth = Math.max(digitsWidth(time.beats), digitsWidth(time.beatType));
  const centre = x + blockWidth / 2;

  emitDigits(numerator, centre, staffTop + 1, glyphs);
  emitDigits(denominator, centre, staffTop + 3, glyphs);
}

function emitDigits(digits: string, centre: number, y: number, glyphs: GlyphRun[]): void {
  const total = [...digits].reduce((sum, d) => sum + glyphAdvanceWidth(`timeSig${d}`), 0);
  let x = centre - total / 2;
  for (const digit of digits) {
    const name = `timeSig${digit}`;
    glyphs.push(glyph(name, x, y, 'time-signature'));
    x += glyphAdvanceWidth(name);
  }
}

// --- barlines ---------------------------------------------------------------

function emitBarlines(
  measure: HorizontalMeasure,
  staffTop: number,
  glyphs: GlyphRun[],
  rects: RectShape[],
): void {
  const e = engravingDefaults;
  const bottom = staffTop + STAFF_HEIGHT;
  const line = (x: number, thickness: number): RectShape => ({
    x,
    y: staffTop,
    w: thickness,
    h: bottom - staffTop,
    cls: 'barline',
  });

  if (measure.barlineStart === 'repeat-start') {
    let x = measure.x;
    rects.push(line(x, e.thickBarlineThickness));
    x += e.thickBarlineThickness + e.thinThickBarlineSeparation;
    rects.push(line(x, e.thinBarlineThickness));
    x += e.thinBarlineThickness + e.repeatBarlineDotSeparation;
    glyphs.push(glyph('repeatDot', x, staffTop + 1.5, 'repeat-dot'));
    glyphs.push(glyph('repeatDot', x, staffTop + 2.5, 'repeat-dot'));
  }

  const right = measure.x + measure.width;
  switch (measure.barlineEnd) {
    case 'none':
      break;
    case 'dashed':
      rects.push(...dashes(right - e.dashedBarlineThickness, staffTop, bottom));
      break;
    case 'double':
      rects.push(line(right - e.thinBarlineThickness, e.thinBarlineThickness));
      rects.push(
        line(
          right - e.thinBarlineThickness * 2 - e.barlineSeparation,
          e.thinBarlineThickness,
        ),
      );
      break;
    case 'final':
      rects.push(line(right - e.thickBarlineThickness, e.thickBarlineThickness));
      rects.push(
        line(
          right - e.thickBarlineThickness - e.thinThickBarlineSeparation - e.thinBarlineThickness,
          e.thinBarlineThickness,
        ),
      );
      break;
    case 'repeat-end': {
      rects.push(line(right - e.thickBarlineThickness, e.thickBarlineThickness));
      const thinX =
        right - e.thickBarlineThickness - e.thinThickBarlineSeparation - e.thinBarlineThickness;
      rects.push(line(thinX, e.thinBarlineThickness));
      const dotX = thinX - e.repeatBarlineDotSeparation - glyphAdvanceWidth('repeatDot');
      glyphs.push(glyph('repeatDot', dotX, staffTop + 1.5, 'repeat-dot'));
      glyphs.push(glyph('repeatDot', dotX, staffTop + 2.5, 'repeat-dot'));
      break;
    }
    default:
      rects.push(line(right - e.thinBarlineThickness, e.thinBarlineThickness));
  }
}

/**
 * A dashed barline as discrete dash segments spanning the same top-line-to-bottom-line
 * height as any other barline (engraving.md "## Barlines").
 *
 * Dash and gap keep their `engravingDefaults` lengths exactly — stretching either to fit
 * the staff would make the cadence font-dependent in a way the metadata does not
 * sanction. Instead the whole run is centred on the staff and clipped to it, so the
 * pattern is symmetric and the outermost dashes still touch the top and bottom lines
 * (with Bravura's 0.5/0.25 those clip to roughly half a dash each).
 */
function dashes(x: number, staffTop: number, bottom: number): RectShape[] {
  const { dashedBarlineThickness, dashedBarlineDashLength, dashedBarlineGapLength } =
    engravingDefaults;
  const height = bottom - staffTop;
  const period = dashedBarlineDashLength + dashedBarlineGapLength;
  const count = Math.max(2, Math.round((height + dashedBarlineGapLength) / period));
  const run = count * dashedBarlineDashLength + (count - 1) * dashedBarlineGapLength;
  const first = staffTop + (height - run) / 2;

  const out: RectShape[] = [];
  for (let i = 0; i < count; i += 1) {
    const top = Math.max(staffTop, first + i * period);
    const end = Math.min(bottom, first + i * period + dashedBarlineDashLength);
    if (end - top <= 1e-9) continue;
    out.push({ x, y: top, w: dashedBarlineThickness, h: end - top, cls: 'barline' });
  }
  return out;
}

// --- elements ---------------------------------------------------------------

interface ElementContext {
  x: number;
  columnLeft: number;
  columnRight: number;
  staffTop: number;
  systemIndex: number;
  glyphs: GlyphRun[];
  rects: RectShape[];
  elements: Record<string, ElementBox>;
  placement: Map<NoteId, Placement>;
}

function emitElement(element: VerticalElement, ctx: ElementContext): void {
  if (element.rest) {
    emitRest(element, ctx);
    return;
  }
  const { staffTop } = ctx;

  for (const head of element.noteheads) {
    const headX = ctx.x + head.dx;

    if (head.accidental) {
      const accX = ctx.x + head.accidental.dx;
      const accY = staffTop + head.accidental.y;
      if (head.accidental.parenthesized) {
        ctx.glyphs.push(
          glyph(
            'accidentalParensLeft',
            accX - glyphAdvanceWidth('accidentalParensLeft'),
            accY,
            'accidental',
            head.id,
          ),
        );
        ctx.glyphs.push(
          glyph('accidentalParensRight', accX + head.accidental.width, accY, 'accidental', head.id),
        );
      }
      ctx.glyphs.push(glyph(head.accidental.glyph, accX, accY, 'accidental', head.id));
    }

    for (const y of head.ledgerLines) {
      ctx.rects.push(
        centeredRect(
          headX - engravingDefaults.legerLineExtension,
          staffTop + y,
          head.width + 2 * engravingDefaults.legerLineExtension,
          engravingDefaults.legerLineThickness,
          'ledger-line',
          head.id,
        ),
      );
    }

    ctx.glyphs.push(glyph(head.glyph, headX, staffTop + head.staffPosition, 'notehead', head.id));

    for (const dot of head.dots) {
      ctx.glyphs.push(glyph('augmentationDot', ctx.x + dot.dx, staffTop + dot.y, 'dot', head.id));
    }

    ctx.elements[head.id] = noteBox(element, head, headX, ctx);
  }

  const stem = element.stem;
  if (stem?.drawn) {
    const owner = element.noteheads[0]?.id;
    ctx.rects.push({
      x: ctx.x + stem.dx,
      y: staffTop + stem.yTop,
      w: stem.width,
      h: stem.yBottom - stem.yTop,
      cls: 'stem',
      ...(owner ? { el: owner } : {}),
    });
    if (stem.flag) {
      ctx.glyphs.push(
        glyph(stem.flag.glyph, ctx.x + stem.flag.dx, staffTop + stem.flag.y, 'flag', owner),
      );
    }
  }

  const breath = element.breath;
  if (breath) {
    ctx.glyphs.push(
      glyph(breath.glyph, ctx.x + breath.dx, staffTop + breath.y, 'breath', element.id),
    );
  }

  const first = element.noteheads[0];
  if (first) {
    ctx.placement.set(element.id, {
      systemIndex: ctx.systemIndex,
      x: ctx.x,
      y: staffTop + first.staffPosition,
    });
  }
}

function emitRest(element: VerticalElement, ctx: ElementContext): void {
  const rest = element.rest!;
  // engraving.md: only a whole-bar rest's x is overridden — it centres in its column
  // rather than deriving from its (always-zero) tick offset.
  const x = rest.wholeBar
    ? (ctx.columnLeft + ctx.columnRight) / 2 - rest.width / 2
    : ctx.x;
  const y = ctx.staffTop + rest.y;
  ctx.glyphs.push(glyph(rest.glyph, x, y, 'rest', element.id));
  for (const dot of rest.dots) {
    ctx.glyphs.push(glyph('augmentationDot', x + dot.dx, ctx.staffTop + dot.y, 'dot', element.id));
  }

  const bbox = glyphBBox(rest.glyph);
  const box: Box = {
    x,
    y: y - bbox.bBoxNE[1],
    w: rest.width,
    h: Math.max(0.5, bbox.bBoxNE[1] - bbox.bBoxSW[1]),
  };
  ctx.elements[element.id] = {
    id: element.id,
    kind: 'rest',
    systemIndex: ctx.systemIndex,
    measureIndex: element.measureIndex,
    voice: element.voice,
    ...box,
    hitBox: pad(box),
    staffPosition: rest.y,
    tick: element.tick,
    durationTicks: element.durationTicks,
    label: restLabel(element, rest.wholeBar),
  };
  ctx.placement.set(element.id, { systemIndex: ctx.systemIndex, x, y });
}

function noteBox(
  element: VerticalElement,
  head: NoteheadLayout,
  headX: number,
  ctx: ElementContext,
): ElementBox {
  const box: Box = {
    x: headX,
    y: ctx.staffTop + head.staffPosition - 0.5,
    w: head.width,
    h: 1,
  };
  return {
    id: head.id,
    kind: element.kind === 'chord' ? 'chord' : 'note',
    systemIndex: ctx.systemIndex,
    measureIndex: element.measureIndex,
    voice: element.voice,
    ...box,
    hitBox: pad(box),
    staffPosition: head.staffPosition,
    tick: element.tick,
    durationTicks: element.durationTicks,
    label: `${describePitch(head.pitch)}, ${describeDuration(element.duration, 'note')}, measure ${element.measureIndex + 1}`,
  };
}

/** A hit target is a little larger than the ink — interaction.md's default tolerance. */
function pad(box: Box): Box {
  return { x: box.x - 0.15, y: box.y - 0.15, w: box.w + 0.3, h: box.h + 0.3 };
}

// --- labels -----------------------------------------------------------------

const BASE_NAME: Record<DurationBase, string> = {
  breve: 'breve',
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirty-second',
  '64th': 'sixty-fourth',
};

export function describeDuration(duration: Duration, kind: 'note' | 'rest'): string {
  const dots = duration.dots === 1 ? 'dotted ' : duration.dots === 2 ? 'double dotted ' : '';
  return `${dots}${BASE_NAME[duration.base] ?? 'quarter'} ${kind}`;
}

function restLabel(element: VerticalElement, wholeBar: boolean): string {
  const what = wholeBar ? 'whole-bar rest' : describeDuration(element.duration, 'rest');
  return `${what}, measure ${element.measureIndex + 1}`;
}

// --- primitives -------------------------------------------------------------

function glyph(name: string, x: number, y: number, cls: string, el?: NoteId): GlyphRun {
  return { x, y, cp: glyphCodepoint(name) ?? 0, cls, ...(el ? { el } : {}) };
}

/** A rule centred on `y` — staff and ledger lines are specified by their centre line,
 *  not their top edge. */
function centeredRect(
  x: number,
  y: number,
  w: number,
  thickness: number,
  cls: string,
  el?: NoteId,
): RectShape {
  return { x, y: y - thickness / 2, w, h: thickness, cls, ...(el ? { el } : {}) };
}

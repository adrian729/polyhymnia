import { engravingDefaults, glyphAdvanceWidth } from '../font/metadata.js';
import { DEFAULT_OPTIONS, type NotationOptions } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import type { ClefSpec, KeySpec, TimeSpec } from './records.js';
import type { NormalizedMeasure, NormalizedScore } from './normalize.js';
import { clefEquals, clefGlyph, keySignature } from './staff.js';
import type { TemporalScore } from './temporal.js';
import type { VerticalElement, VerticalScore } from './vertical.js';

const ROD_PADDING = 0.4;
export const EPS_STRETCH = 0.05;
export const CHROME_GAP = 0.6;
export const KEY_GAP = 0.1;
export const BARLINE_PAD = 0.4;
const MEASURE_LEAD = 0.4;
const MIN_MEASURE_CONTENT = 4;

export interface LayoutColumn {
  staffIndex: number;
  measureIndex: number;
  tick: number;
  measureTick: number;
  spanTicks: number;
  elements: readonly VerticalElement[];
  leftWidth: number;
  rightWidth: number;
  rodWidth: number;
  idealWidth: number;
  width: number;
  stretch: number;
  xStart: number;
  x: number;
}

export interface MeasureChrome {
  showClef: boolean;
  showKey: boolean;
  showTime: boolean;
  clefWidth: number;
  keyWidth: number;
  timeWidth: number;
  startBarlineWidth: number;
  endBarlineWidth: number;
  leadWidth: number;
  cancelKey: KeySpec | null;
}

export interface HorizontalMeasure {
  index: number;
  staffIndex: number;
  barlineStart: NormalizedMeasure['barlineStart'];
  barlineEnd: NormalizedMeasure['barlineEnd'];
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  startTick: number;
  endTick: number;
  capacityTicks: number;
  columns: readonly LayoutColumn[];
  contentWidth: number;
  startChrome: MeasureChrome;
  midChrome: MeasureChrome;
  systemBreak: boolean;
  x: number;
  width: number;
  chrome: MeasureChrome;
  systemIndex: number;
}

export interface HorizontalScore {
  measures: readonly HorizontalMeasure[];
  diagnostics: readonly Diagnostic[];
}

export function horizontal(
  normalized: NormalizedScore,
  temporal: TemporalScore,
  laidOut: VerticalScore,
  options?: NotationOptions,
): HorizontalScore {
  const diagnostics: Diagnostic[] = [];
  const staff = normalized.staves[0];
  if (!staff) return { measures: [], diagnostics };

  const base = options?.spacing?.base ?? DEFAULT_OPTIONS.spacing.base;
  const k = options?.spacing?.k ?? DEFAULT_OPTIONS.spacing.k;
  const { divisions } = normalized;

  const measures: HorizontalMeasure[] = [];
  let previous: NormalizedMeasure | undefined;

  for (const measure of staff.measures) {
    const bounds = temporal.measures.find(
      (m) => m.staffIndex === staff.index && m.index === measure.index,
    );
    const startTick = bounds?.startTick ?? 0;
    const endTick = bounds?.endTick ?? startTick + measure.capacityTicks;

    const elements = laidOut.elements.filter(
      (e) => e.staffIndex === staff.index && e.measureIndex === measure.index,
    );
    const columns = buildColumns(elements, {
      staffIndex: staff.index,
      measureIndex: measure.index,
      endTick,
      divisions,
      base,
      k,
    });
    const contentWidth = columns.reduce((sum, c) => sum + c.width, 0) || MIN_MEASURE_CONTENT;

    measures.push({
      index: measure.index,
      staffIndex: staff.index,
      barlineStart: measure.barlineStart,
      barlineEnd: measure.barlineEnd,
      clef: measure.clef,
      key: measure.key,
      time: measure.time,
      startTick,
      endTick,
      capacityTicks: measure.capacityTicks,
      columns,
      contentWidth,
      startChrome: chromeOf(measure, previous, true),
      midChrome: chromeOf(measure, previous, false),
      systemBreak: measure.systemBreak,
      x: 0,
      width: 0,
      chrome: chromeOf(measure, previous, false),
      systemIndex: 0,
    });
    previous = measure;
  }

  return { measures, diagnostics };
}

interface ColumnContext {
  staffIndex: number;
  measureIndex: number;
  endTick: number;
  divisions: number;
  base: number;
  k: number;
}

function buildColumns(
  elements: readonly VerticalElement[],
  ctx: ColumnContext,
): LayoutColumn[] {
  const byTick = new Map<number, VerticalElement[]>();
  for (const el of elements) {
    const bucket = byTick.get(el.tick);
    if (bucket) bucket.push(el);
    else byTick.set(el.tick, [el]);
  }
  const ticks = [...byTick.keys()].sort((a, b) => a - b);

  return ticks.map((tick, i) => {
    const members = byTick.get(tick)!;
    const next = ticks[i + 1] ?? ctx.endTick;
    const spanTicks = Math.max(1, next - tick);
    const leftWidth = members.reduce((max, e) => Math.max(max, e.leftWidth), 0);
    const rightWidth = members.reduce((max, e) => Math.max(max, e.rightWidth), 0);
    const rodWidth = leftWidth + rightWidth + ROD_PADDING;
    const idealWidth = ctx.base * (spanTicks / ctx.divisions) ** ctx.k;
    const nextLeftWidth = byTick
      .get(ticks[i + 1] ?? -1)
      ?.reduce((max, e) => Math.max(max, e.leftWidth), 0) ?? 0;
    const springWidth = idealWidth + Math.max(0, leftWidth - nextLeftWidth);
    return {
      staffIndex: ctx.staffIndex,
      measureIndex: ctx.measureIndex,
      tick,
      measureTick: members[0]!.measureTick,
      spanTicks,
      elements: members,
      leftWidth,
      rightWidth,
      rodWidth,
      idealWidth,
      width: Math.max(rodWidth, springWidth),
      stretch: idealWidth + EPS_STRETCH,
      xStart: 0,
      x: 0,
    } satisfies LayoutColumn;
  });
}

function chromeOf(
  measure: NormalizedMeasure,
  previous: NormalizedMeasure | undefined,
  atSystemStart: boolean,
): MeasureChrome {
  const clefChanged = !previous || !clefEquals(measure.clef, previous.clef);
  const keyChanged = !previous || measure.key.fifths !== previous.key.fifths;
  const timeChanged = !previous || !timeEquals(measure.time, previous.time);

  const showClef = atSystemStart || clefChanged;
  const showKey = (atSystemStart && measure.key.fifths !== 0) || keyChanged;
  const showTime = timeChanged;
  const cancelKey = keyChanged && previous ? cancellation(previous.key, measure.key) : null;

  const widths = {
    clefWidth: showClef ? glyphAdvanceWidth(clefGlyph(measure.clef)) + CHROME_GAP : 0,
    keyWidth: showKey || cancelKey ? keyWidth(measure, cancelKey, showKey) : 0,
    timeWidth: showTime ? timeWidthOf(measure.time) : 0,
    startBarlineWidth: measure.barlineStart === 'repeat-start' ? repeatStartWidth() : 0,
  };
  const bare =
    widths.clefWidth === 0 &&
    widths.keyWidth === 0 &&
    widths.timeWidth === 0 &&
    widths.startBarlineWidth === 0;

  return {
    showClef,
    showKey,
    showTime,
    ...widths,
    endBarlineWidth: endBarlineWidth(measure.barlineEnd),
    leadWidth: bare ? MEASURE_LEAD : 0,
    cancelKey,
  };
}

function timeEquals(a: TimeSpec, b: TimeSpec): boolean {
  return a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? 'normal') === (b.symbol ?? 'normal');
}

function cancellation(from: KeySpec, to: KeySpec): KeySpec | null {
  const sameSide = Math.sign(from.fifths) === Math.sign(to.fifths);
  const count = sameSide ? Math.abs(from.fifths) - Math.abs(to.fifths) : Math.abs(from.fifths);
  if (count <= 0) return null;
  return { fifths: from.fifths };
}

function keyWidth(
  measure: NormalizedMeasure,
  cancelKey: KeySpec | null,
  showKey: boolean,
): number {
  let width = 0;
  if (cancelKey) {
    const naturals = cancelledAccidentals(cancelKey, measure.key, measure.clef).length;
    width += naturals * (glyphAdvanceWidth('accidentalNatural') + KEY_GAP);
  }
  if (showKey) {
    for (const acc of keySignature(measure.key, measure.clef)) {
      width += glyphAdvanceWidth(acc.glyph) + KEY_GAP;
    }
  }
  return width > 0 ? width + CHROME_GAP : 0;
}

export function cancelledAccidentals(
  from: KeySpec,
  to: KeySpec,
  clef: ClefSpec,
): readonly { step: number; y: number; glyph: string }[] {
  const incoming = new Set(keySignature(to, clef).map((a) => a.step));
  return keySignature(from, clef)
    .filter((a) => !incoming.has(a.step))
    .map((a) => ({ step: a.step, y: a.y, glyph: 'accidentalNatural' }));
}

function timeWidthOf(time: TimeSpec): number {
  if (time.symbol === 'common' || time.symbol === 'cut') {
    return glyphAdvanceWidth(time.symbol === 'cut' ? 'timeSigCutCommon' : 'timeSigCommon') + CHROME_GAP;
  }
  return Math.max(digitsWidth(time.beats), digitsWidth(time.beatType)) + CHROME_GAP;
}

export function digitsWidth(value: number): number {
  return [...String(Math.max(0, Math.round(value)))].reduce(
    (sum, d) => sum + glyphAdvanceWidth(`timeSig${d}`),
    0,
  );
}

export function endBarlineWidth(kind: NormalizedMeasure['barlineEnd']): number {
  const e = engravingDefaults;
  switch (kind) {
    case 'none':
      return 0;
    case 'double':
      return BARLINE_PAD + e.thinBarlineThickness * 2 + e.barlineSeparation;
    case 'dashed':
      return BARLINE_PAD + e.dashedBarlineThickness;
    case 'final':
      return BARLINE_PAD + e.thinBarlineThickness + e.thinThickBarlineSeparation + e.thickBarlineThickness;
    case 'repeat-end':
      return (
        BARLINE_PAD +
        glyphAdvanceWidth('repeatDot') +
        e.repeatBarlineDotSeparation +
        e.thinBarlineThickness +
        e.thinThickBarlineSeparation +
        e.thickBarlineThickness
      );
    default:
      return BARLINE_PAD + e.thinBarlineThickness;
  }
}

export function repeatStartWidth(): number {
  const e = engravingDefaults;
  return (
    e.thickBarlineThickness +
    e.thinThickBarlineSeparation +
    e.thinBarlineThickness +
    e.repeatBarlineDotSeparation +
    glyphAdvanceWidth('repeatDot') +
    BARLINE_PAD
  );
}

export function chromeWidth(chrome: MeasureChrome): number {
  return (
    chrome.startBarlineWidth +
    chrome.clefWidth +
    chrome.keyWidth +
    chrome.timeWidth +
    chrome.leadWidth
  );
}

export function measureWidth(measure: HorizontalMeasure, atSystemStart: boolean): number {
  const chrome = atSystemStart ? measure.startChrome : measure.midChrome;
  return chromeWidth(chrome) + measure.contentWidth + chrome.endBarlineWidth;
}

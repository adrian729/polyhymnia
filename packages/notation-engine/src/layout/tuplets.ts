import type { Diagnostic } from '@polyhymnia/notation-model';
import { engravingDefaults, glyphAdvanceWidth, glyphBBox } from '../font/metadata.js';
import { DEFAULT_OPTIONS, type NotationOptions } from '../options.js';
import type { BeamPolygon, BeamsResult } from './beams.js';
import type { TupletSpan } from './grouping.js';
import type { JustifiedScore } from './justify.js';
import type { NormalizedBeam, NoteId, TupletDisplay } from './records.js';
import { stemX, type VerticalElement } from './vertical.js';

const GAP = 0.3;
const HOOK_LENGTH = 0.5;

export interface TupletRect {
  el: string;
  systemIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TupletNumeralGlyph {
  el: string;
  systemIndex: number;
  x: number;
  y: number;
  name: string;
}

export interface TupletsResult {
  brackets: readonly TupletRect[];
  numerals: readonly TupletNumeralGlyph[];
  diagnostics: readonly Diagnostic[];
}

interface Placed {
  el: VerticalElement;
  x: number;
  systemIndex: number;
}

export function tuplets(
  justified: JustifiedScore,
  spans: readonly TupletSpan[],
  beamGroups: readonly NormalizedBeam[],
  beamsResult: BeamsResult,
  options?: NotationOptions,
): TupletsResult {
  const placedById = buildPlacedMap(justified);
  const showRatioDefault = options?.tuplets?.showRatio ?? DEFAULT_OPTIONS.tuplets.showRatio;
  const thickness = engravingDefaults.tupletBracketThickness;

  const brackets: TupletRect[] = [];
  const numerals: TupletNumeralGlyph[] = [];

  for (const span of spans) {
    const placed = span.elements
      .map((id) => placedById.get(id))
      .filter((p): p is Placed => p !== undefined);
    if (placed.length === 0) continue;

    const systemIndex = placed[0]!.systemIndex;
    const side = resolveSide(span.display, placed);
    const first = placed[0]!;
    const last = placed[placed.length - 1]!;
    const x0 = leftEdge(first);
    const x1 = rightEdge(last);
    const centerX = (noteheadCenterX(first) + noteheadCenterX(last)) / 2;

    let lineY: number;
    let numeralMidX: number;
    if (span.showBracket) {
      const extreme = extremeY(placed, side, beamsResult.stemOverrides);
      lineY = side === 'above' ? extreme - 1.0 : extreme + 1.0;
      numeralMidX = (x0 + x1) / 2;

      brackets.push({
        el: span.id,
        systemIndex,
        x: Math.min(x0, x1),
        y: lineY - thickness / 2,
        w: Math.abs(x1 - x0),
        h: thickness,
      });

      if (!edgeAbutsBeam(span.elements, 'first', beamGroups)) {
        brackets.push(hookRect(span.id, systemIndex, x0, lineY, side, thickness));
      }
      if (!edgeAbutsBeam(span.elements, 'last', beamGroups)) {
        brackets.push(hookRect(span.id, systemIndex, x1, lineY, side, thickness));
      }
    } else {
      const beamId = coveringBeamId(span, beamGroups);
      const polygon = beamId ? beamsResult.polygons.find((p) => p.el === beamId) : undefined;
      numeralMidX = centerX;
      lineY = polygon
        ? beamOuterYAt(polygon, numeralMidX)
        : extremeY(placed, side, beamsResult.stemOverrides);
    }

    const names = numeralGlyphs(span, showRatioDefault);
    if (names.length === 0) continue;

    const width = names.reduce((sum, name) => sum + glyphAdvanceWidth(name), 0);
    const bbox = glyphBBox(names[0]!);
    const topOffset = bbox.bBoxNE[1];
    const bottomOffset = -bbox.bBoxSW[1];
    const edgeThickness = span.showBracket ? thickness / 2 : 0;
    const anchorY =
      side === 'above'
        ? lineY - edgeThickness - GAP - bottomOffset
        : lineY + edgeThickness + GAP + topOffset;

    let x = numeralMidX - width / 2;
    for (const name of names) {
      numerals.push({ el: span.id, systemIndex, x, y: anchorY, name });
      x += glyphAdvanceWidth(name);
    }
  }

  return { brackets, numerals, diagnostics: [] };
}

function buildPlacedMap(justified: JustifiedScore): Map<NoteId, Placed> {
  const placedById = new Map<NoteId, Placed>();
  for (const system of justified.systems) {
    for (const measure of system.measures) {
      for (const column of measure.columns) {
        for (const el of column.elements) {
          placedById.set(el.id, { el, x: column.x, systemIndex: measure.systemIndex });
        }
      }
    }
  }
  return placedById;
}

function resolveSide(display: TupletDisplay, placed: readonly Placed[]): 'above' | 'below' {
  if (display.placement === 'above' || display.placement === 'below') return display.placement;
  let up = false;
  let down = false;
  for (const p of placed) {
    if (p.el.stem?.dir === 1) up = true;
    if (p.el.stem?.dir === -1) down = true;
  }
  if (up && !down) return 'above';
  if (down && !up) return 'below';
  return 'above';
}

function extremeY(
  placed: readonly Placed[],
  side: 'above' | 'below',
  stemOverrides: ReadonlyMap<NoteId, { yTop: number; yBottom: number }>,
): number {
  let extreme = side === 'above' ? Infinity : -Infinity;
  const take = (y: number): void => {
    extreme = side === 'above' ? Math.min(extreme, y) : Math.max(extreme, y);
  };
  for (const p of placed) {
    const el = p.el;
    for (const head of el.noteheads) take(head.staffPosition);
    if (el.stem?.drawn) {
      const override = stemOverrides.get(el.id);
      const yTop = override?.yTop ?? el.stem.yTop;
      const yBottom = override?.yBottom ?? el.stem.yBottom;
      take(yTop);
      take(yBottom);
    }
    if (el.stem?.flag) {
      const bbox = glyphBBox(el.stem.flag.glyph);
      take(el.stem.flag.y - bbox.bBoxNE[1]);
      take(el.stem.flag.y - bbox.bBoxSW[1]);
    }
    if (el.rest) {
      take(el.rest.y - 1);
      take(el.rest.y + 1);
    }
  }
  return Number.isFinite(extreme) ? extreme : side === 'above' ? 0 : 4;
}

function leftEdge(p: Placed): number {
  let left = p.x;
  for (const head of p.el.noteheads) left = Math.min(left, p.x + head.dx);
  if (p.el.stem?.drawn) left = Math.min(left, stemX(p.x, p.el.stem));
  return left;
}

function rightEdge(p: Placed): number {
  let right = p.x;
  for (const head of p.el.noteheads) right = Math.max(right, p.x + head.dx + head.width);
  if (p.el.stem?.drawn) right = Math.max(right, stemX(p.x, p.el.stem) + p.el.stem.width);
  if (p.el.rest) right = Math.max(right, p.x + p.el.rest.width);
  return right;
}

function noteheadCenterX(p: Placed): number {
  if (p.el.noteheads.length === 0) return p.x;
  let min = p.x + p.el.noteheads[0]!.dx;
  let max = min + p.el.noteheads[0]!.width;
  for (const head of p.el.noteheads) {
    min = Math.min(min, p.x + head.dx);
    max = Math.max(max, p.x + head.dx + head.width);
  }
  return (min + max) / 2;
}

function hookRect(
  el: string,
  systemIndex: number,
  x: number,
  lineY: number,
  side: 'above' | 'below',
  thickness: number,
): TupletRect {
  const y = side === 'above' ? lineY : lineY - HOOK_LENGTH;
  return { el, systemIndex, x: x - thickness / 2, y, w: thickness, h: HOOK_LENGTH };
}

function edgeAbutsBeam(
  elements: readonly NoteId[],
  edge: 'first' | 'last',
  beamGroups: readonly NormalizedBeam[],
): boolean {
  if (elements.length < 2) return false;
  const idx = edge === 'first' ? 0 : elements.length - 1;
  const neighbour = edge === 'first' ? 1 : elements.length - 2;
  const a = elements[idx]!;
  const b = elements[neighbour]!;
  return beamGroups.some((g) => g.elements.includes(a) && g.elements.includes(b));
}

function coveringBeamId(
  span: TupletSpan,
  beamGroups: readonly NormalizedBeam[],
): string | undefined {
  const beam = beamGroups.find((g) => span.elements.every((id) => g.elements.includes(id)));
  return beam?.id;
}

function beamOuterYAt(polygon: BeamPolygon, x: number): number {
  const [x0, y0] = polygon.points[3]!;
  const [x1, y1] = polygon.points[2]!;
  if (Math.abs(x1 - x0) < 1e-9) return y0;
  const slope = (y1 - y0) / (x1 - x0);
  return y0 + slope * (x - x0);
}

function numeralGlyphs(span: TupletSpan, showRatioDefault: boolean): string[] {
  const mode = span.display.showNumber ?? (showRatioDefault ? 'both' : 'inner');
  if (mode === 'noNumber') return [];
  const actual = digitGlyphs(span.actual);
  if (mode === 'both') return [...actual, 'tupletColon', ...digitGlyphs(span.normal)];
  return actual;
}

function digitGlyphs(n: number): string[] {
  return [...String(Math.max(0, Math.round(n)))].map((d) => `tuplet${d}`);
}

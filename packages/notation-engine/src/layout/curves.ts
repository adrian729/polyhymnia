import type { Diagnostic } from '@polyhymnia/notation-model';
import { engravingDefaults } from '../font/metadata.js';
import type { NotationOptions } from '../options.js';
import type { BeamsResult } from './beams.js';
import type { JustifiedScore, JustifiedSystem } from './justify.js';
import type { NoteId, NormalizedTie } from './records.js';
import { MIDDLE_LINE, STAFF_HEIGHT } from './staff.js';
import type { NoteheadLayout, VerticalElement, VerticalScore } from './vertical.js';

const GAP = 0.3;
const V_OFFSET = 0.5;
const MIN_SPAN = 0.6;
const ARCH_BASE = 0.35;
const ARCH_PER_SP = 0.03;
const ARCH_MIN = 0.35;
const ARCH_MAX = 1.0;
const SYSTEM_END_MARGIN = 0.5;
const SYSTEM_START_MARGIN = 1.5;
const LINE_CLEARANCE = 0.2;
const ENDPOINT_NUDGE = 0.25;
const APEX_ARCH_FRACTION = 0.75;

export interface CurveShape {
  systemIndex: number;
  d: string;
  cls: 'tie' | 'slur';
  el: string;
}

export interface CurvesResult {
  shapes: readonly CurveShape[];
  diagnostics: readonly Diagnostic[];
}

export interface PlacedNote {
  el: VerticalElement;
  head: NoteheadLayout;
  x: number;
  systemIndex: number;
}

export function curves(
  justified: JustifiedScore,
  placedScore: VerticalScore,
  _beamsResult: BeamsResult,
  ties: readonly NormalizedTie[],
  _options?: NotationOptions,
): CurvesResult {
  const noteMap = buildNoteMap(justified);
  const twoVoiceMeasures = new Set(
    placedScore.elements.filter((e) => e.voice === 1).map((e) => e.measureIndex),
  );
  const chordTies = new Map<NoteId, NormalizedTie[]>();
  for (const tie of ties) {
    const from = noteMap.get(tie.from);
    if (!from || from.el.kind !== 'chord') continue;
    const list = chordTies.get(from.el.id) ?? [];
    list.push(tie);
    chordTies.set(from.el.id, list);
  }

  const diagnostics: Diagnostic[] = [];
  const shapes: CurveShape[] = [];

  for (const tie of ties) {
    const from = noteMap.get(tie.from);
    const to = noteMap.get(tie.to);
    if (!from || !to) {
      diagnostics.push({
        severity: 'warning',
        code: 'tie-unplaced',
        message: `Tie ${tie.id} could not be drawn; one or both endpoints were not laid out.`,
        measureIndex: tie.measureIndex,
      });
      continue;
    }

    const siblingTies = from.el.kind === 'chord' ? (chordTies.get(from.el.id) ?? [tie]) : [tie];
    const siblings = siblingTies
      .map((t) => noteMap.get(t.from))
      .filter((p): p is PlacedNote => p !== undefined);
    const dir = directionFor(from, siblings, twoVoiceMeasures.has(tie.measureIndex));

    if (from.systemIndex === to.systemIndex) {
      shapes.push(oneCurve(tie.id, from, to, dir));
      continue;
    }

    const fromSystem = justified.systems[from.systemIndex];
    const toSystem = justified.systems[to.systemIndex];
    if (!fromSystem || !toSystem) continue;
    shapes.push(firstHalf(tie.id, from, dir, fromSystem));
    shapes.push(secondHalf(tie.id, to, dir, toSystem));
  }

  return { shapes, diagnostics };
}

function buildNoteMap(justified: JustifiedScore): Map<NoteId, PlacedNote> {
  const map = new Map<NoteId, PlacedNote>();
  for (const system of justified.systems) {
    for (const measure of system.measures) {
      for (const column of measure.columns) {
        for (const el of column.elements) {
          for (const head of el.noteheads) {
            map.set(head.id, { el, head, x: column.x, systemIndex: measure.systemIndex });
          }
        }
      }
    }
  }
  return map;
}

function directionFor(
  from: PlacedNote,
  siblings: readonly PlacedNote[],
  twoVoice: boolean,
): 1 | -1 {
  if (twoVoice) return from.el.voice === 0 ? 1 : -1;
  if (from.el.kind === 'chord' && siblings.length > 1) {
    const positions = siblings.map((s) => s.head.staffPosition);
    const top = Math.min(...positions);
    const bottom = Math.max(...positions);
    if (from.head.staffPosition === top) return 1;
    if (from.head.staffPosition === bottom) return -1;
    const mid = (top + bottom) / 2;
    return from.head.staffPosition < mid ? 1 : -1;
  }
  if (from.el.stem) return from.el.stem.dir === 1 ? -1 : 1;
  return from.head.staffPosition <= MIDDLE_LINE ? 1 : -1;
}

function archFor(span: number): number {
  return Math.min(ARCH_MAX, Math.max(ARCH_MIN, ARCH_BASE + Math.max(0, span) * ARCH_PER_SP));
}

function rightEdge(note: PlacedNote): number {
  return note.x + note.head.dx + note.head.width;
}

function leftEdge(note: PlacedNote): number {
  return note.x + note.head.dx;
}

function withinStaff(y: number): boolean {
  return y >= 0 && y <= STAFF_HEIGHT;
}

function nearLine(y: number): boolean {
  return withinStaff(y) && Math.abs(y - Math.round(y)) < LINE_CLEARANCE;
}

export function endpointY(note: PlacedNote, dir: 1 | -1): number {
  const y = note.head.staffPosition - dir * V_OFFSET;
  return nearLine(y) ? y - dir * ENDPOINT_NUDGE : y;
}

export function clearApex(y0: number, y3: number, dir: 1 | -1, arch: number): number {
  const base = (y0 + y3) / 2;
  const apex = base - dir * APEX_ARCH_FRACTION * arch;
  if (!nearLine(apex)) return arch;
  const target = Math.round(apex) - dir * LINE_CLEARANCE;
  const needed = (dir * (base - target)) / APEX_ARCH_FRACTION;
  return Math.max(arch, needed, ARCH_MIN);
}

function oneCurve(id: string, from: PlacedNote, to: PlacedNote, dir: 1 | -1): CurveShape {
  const x0 = rightEdge(from) + GAP;
  const x3 = Math.max(leftEdge(to) - GAP, x0 + MIN_SPAN);
  const y0 = endpointY(from, dir);
  const y3 = endpointY(to, dir);
  const arch = clearApex(y0, y3, dir, archFor(x3 - x0));
  return {
    el: id,
    systemIndex: from.systemIndex,
    cls: 'tie',
    d: curvePath([x0, y0], [x3, y3], dir, arch, engravingDefaults.tieEndpointThickness, engravingDefaults.tieMidpointThickness),
  };
}

function lastColumnX(system: JustifiedSystem): number {
  const measure = system.measures[system.measures.length - 1];
  const column = measure?.columns[measure.columns.length - 1];
  return column ? column.x : system.width;
}

function firstColumnX(system: JustifiedSystem): number {
  const measure = system.measures[0];
  const column = measure?.columns[0];
  return column ? column.x : 0;
}

function firstHalf(id: string, from: PlacedNote, dir: 1 | -1, system: JustifiedSystem): CurveShape {
  const x0 = rightEdge(from) + GAP;
  const x3 = Math.max(x0 + MIN_SPAN, Math.min(system.width, lastColumnX(system) + SYSTEM_END_MARGIN));
  const y = endpointY(from, dir);
  const arch = clearApex(y, y, dir, archFor(x3 - x0));
  return {
    el: id,
    systemIndex: from.systemIndex,
    cls: 'tie',
    d: curvePath([x0, y], [x3, y], dir, arch, engravingDefaults.tieEndpointThickness, engravingDefaults.tieMidpointThickness),
  };
}

function secondHalf(id: string, to: PlacedNote, dir: 1 | -1, system: JustifiedSystem): CurveShape {
  const x3 = leftEdge(to) - GAP;
  const x0 = Math.min(x3 - MIN_SPAN, Math.max(0, firstColumnX(system) - SYSTEM_START_MARGIN));
  const y = endpointY(to, dir);
  const arch = clearApex(y, y, dir, archFor(x3 - x0));
  return {
    el: id,
    systemIndex: to.systemIndex,
    cls: 'tie',
    d: curvePath([x0, y], [x3, y], dir, arch, engravingDefaults.tieEndpointThickness, engravingDefaults.tieMidpointThickness),
  };
}

export function curvePath(
  p0: readonly [number, number],
  p3: readonly [number, number],
  dir: 1 | -1,
  arch: number,
  endT: number,
  midT: number,
): string {
  const [x0, y0] = p0;
  const [x3, y3] = p3;
  const dx = x3 - x0;
  const outer0: [number, number] = [x0, y0 - (dir * endT) / 2];
  const outer3: [number, number] = [x3, y3 - (dir * endT) / 2];
  const inner0: [number, number] = [x0, y0 + (dir * endT) / 2];
  const inner3: [number, number] = [x3, y3 + (dir * endT) / 2];
  const innerArch = Math.max(0, arch - midT);
  const oc1: [number, number] = [outer0[0] + dx * 0.25, outer0[1] - dir * arch];
  const oc2: [number, number] = [outer0[0] + dx * 0.75, outer0[1] - dir * arch];
  const ic1: [number, number] = [inner3[0] - dx * 0.25, inner3[1] - dir * innerArch];
  const ic2: [number, number] = [inner3[0] - dx * 0.75, inner3[1] - dir * innerArch];
  const f = (n: number): string => n.toFixed(3);
  return (
    `M${f(outer0[0])},${f(outer0[1])} ` +
    `C${f(oc1[0])},${f(oc1[1])} ${f(oc2[0])},${f(oc2[1])} ${f(outer3[0])},${f(outer3[1])} ` +
    `L${f(inner3[0])},${f(inner3[1])} ` +
    `C${f(ic1[0])},${f(ic1[1])} ${f(ic2[0])},${f(ic2[1])} ${f(inner0[0])},${f(inner0[1])} Z`
  );
}

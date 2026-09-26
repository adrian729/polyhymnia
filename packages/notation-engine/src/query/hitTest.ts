import type { Pitch as MnxPitch } from '@polyhymnia/notation-model';
import { STEP_LETTERS } from '../layout/records.js';
import type { NoteId } from '../layout/records.js';
import { STAFF_HEIGHT, keyAlterOf, stepIndexAt } from '../layout/staff.js';
import type { Box, ElementBox, LayoutResult, MeasureBox, Slot, SystemBox } from '../layout/types.js';

export type HitKind = 'element' | 'slot' | 'point';

export interface HitOptions {
  kinds?: readonly HitKind[];
  voice?: 0 | 1;
  radius?: number;
  insertAlteration?: 'key' | 'natural';
}

export type HitResult =
  | { kind: 'element'; id: NoteId; part: 'notehead' | 'rest'; box: ElementBox; staffPosition: number; pitch: MnxPitch | null }
  | { kind: 'slot'; slot: Slot; staffPosition: number; pitch: MnxPitch }
  | { kind: 'point'; measureIndex: number; systemIndex: number; x: number; tick: number; staffPosition: number; pitch: MnxPitch };

const DEFAULT_KINDS: readonly HitKind[] = ['element', 'slot', 'point'];
const DEFAULT_RADIUS = 0.5;
export const HIT_STAFF_MARGIN = 4;

function toMnxPitch(step: number, alter: number, octave: number): MnxPitch {
  const normalizedStep = ((step % 7) + 7) % 7;
  const letter = STEP_LETTERS[normalizedStep]!;
  return alter !== 0 ? { step: letter, octave, alter } : { step: letter, octave };
}

function pitchAt(staffPosition: number, measureBox: MeasureBox, insertAlteration: 'key' | 'natural'): MnxPitch {
  const stepIdx = stepIndexAt(staffPosition, measureBox.clef);
  const step = ((stepIdx % 7) + 7) % 7;
  const octave = Math.floor(stepIdx / 7);
  const alter = insertAlteration === 'natural' ? 0 : keyAlterOf(measureBox.key, step);
  return toMnxPitch(step, alter, octave);
}

function findSystem(layout: LayoutResult, y: number): SystemBox | undefined {
  return layout.systems.find(
    (s) => y >= s.y - HIT_STAFF_MARGIN && y <= s.y + STAFF_HEIGHT + HIT_STAFF_MARGIN,
  );
}

function findMeasure(layout: LayoutResult, systemIndex: number, x: number): MeasureBox | undefined {
  return layout.measures.find((m) => m.systemIndex === systemIndex && x >= m.x && x < m.x + m.w);
}

function inflatedContains(box: Box, p: { x: number; y: number }, radius: number): boolean {
  return (
    p.x >= box.x - radius &&
    p.x <= box.x + box.w + radius &&
    p.y >= box.y - radius &&
    p.y <= box.y + box.h + radius
  );
}

function hitElement(
  layout: LayoutResult,
  p: { x: number; y: number },
  radius: number,
  voice: 0 | 1 | undefined,
): HitResult | null {
  const systemY = new Map(layout.systems.map((s) => [s.index, s.y] as const));
  let best: ElementBox | undefined;
  let bestDist = Infinity;
  for (const box of Object.values(layout.elements)) {
    if (voice !== undefined && box.voice !== voice) continue;
    if (!inflatedContains(box.hitBox, p, radius)) continue;
    const y = systemY.get(box.systemIndex) ?? 0;
    const dist = Math.abs(box.staffPosition - (p.y - y));
    if (dist < bestDist) {
      bestDist = dist;
      best = box;
    }
  }
  if (!best) return null;

  const pitch = best.pitch ? toMnxPitch(best.pitch.step, best.pitch.alter, best.pitch.octave) : null;
  return {
    kind: 'element',
    id: best.id,
    part: best.kind === 'rest' ? 'rest' : 'notehead',
    box: best,
    staffPosition: best.staffPosition,
    pitch,
  };
}

function hitSlot(
  layout: LayoutResult,
  measureBox: MeasureBox,
  systemY: number,
  p: { x: number; y: number },
  voice: 0 | 1 | undefined,
  insertAlteration: 'key' | 'natural',
): HitResult | null {
  const slot = layout.slots.find(
    (s) =>
      s.measureIndex === measureBox.index &&
      p.x >= s.x &&
      p.x < s.x + s.w &&
      (voice === undefined || s.voice === voice),
  );
  if (!slot) return null;
  const staffPosition = Math.round((p.y - systemY) * 2) / 2;
  const pitch = pitchAt(staffPosition, measureBox, insertAlteration);
  return { kind: 'slot', slot, staffPosition, pitch };
}

function hitPoint(
  layout: LayoutResult,
  measureBox: MeasureBox,
  systemIndex: number,
  systemY: number,
  p: { x: number; y: number },
  insertAlteration: 'key' | 'natural',
): HitResult {
  const staffPosition = Math.round((p.y - systemY) * 2) / 2;
  const pitch = pitchAt(staffPosition, measureBox, insertAlteration);
  const slotHere = layout.slots.find(
    (s) => s.measureIndex === measureBox.index && p.x >= s.x && p.x < s.x + s.w,
  );
  const tick = slotHere ? slotHere.tick - measureBox.startTick : 0;
  return { kind: 'point', measureIndex: measureBox.index, systemIndex, x: p.x, tick, staffPosition, pitch };
}

export function hitTest(
  layout: LayoutResult,
  p: { x: number; y: number },
  opts: HitOptions = {},
): HitResult | null {
  const kinds = opts.kinds ?? DEFAULT_KINDS;
  const radius = opts.radius ?? DEFAULT_RADIUS;
  const insertAlteration = opts.insertAlteration ?? 'key';

  if (kinds.includes('element')) {
    const hit = hitElement(layout, p, radius, opts.voice);
    if (hit) return hit;
  }

  const system = findSystem(layout, p.y);
  if (!system) return null;

  const measureBox = findMeasure(layout, system.index, p.x);
  if (!measureBox) return null;

  if (kinds.includes('slot')) {
    const hit = hitSlot(layout, measureBox, system.y, p, opts.voice, insertAlteration);
    if (hit) return hit;
  }

  if (kinds.includes('point')) {
    return hitPoint(layout, measureBox, system.index, system.y, p, insertAlteration);
  }

  return null;
}

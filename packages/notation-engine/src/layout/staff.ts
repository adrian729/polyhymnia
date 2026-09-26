import { stepIndex, type ClefSpec, type KeySpec, type Pitch } from './records.js';

export const STAFF_LINES = 5;
export const STAFF_HEIGHT = STAFF_LINES - 1;
export const MIDDLE_LINE = STAFF_HEIGHT / 2;

const TOP_LINE_STEP: Record<ClefSpec['kind'], number> = {
  treble: 38,
  bass: 26,
  alto: 32,
  tenor: 30,
};

const CLEF_ANCHOR_STEP: Record<ClefSpec['kind'], number> = {
  treble: 32,
  bass: 24,
  alto: 28,
  tenor: 28,
};

export function topLineStep(clef: ClefSpec): number {
  return TOP_LINE_STEP[clef.kind] + 7 * (clef.octaveShift ?? 0);
}

export function staffPositionOf(p: Pitch, clef: ClefSpec): number {
  return (topLineStep(clef) - stepIndex(p)) * 0.5;
}

export function stepIndexAt(staffPosition: number, clef: ClefSpec): number {
  return topLineStep(clef) - staffPosition * 2;
}

export function clefGlyph(clef: ClefSpec): string {
  const shift = clef.octaveShift ?? 0;
  switch (clef.kind) {
    case 'treble':
      return shift === -1 ? 'gClef8vb' : shift === 1 ? 'gClef8va' : 'gClef';
    case 'bass':
      return shift === -1 ? 'fClef8vb' : shift === 1 ? 'fClef8va' : 'fClef';
    default:
      return 'cClef';
  }
}

export function clefGlyphY(clef: ClefSpec): number {
  return (TOP_LINE_STEP[clef.kind] - CLEF_ANCHOR_STEP[clef.kind]) * 0.5;
}

export function clefEquals(a: ClefSpec, b: ClefSpec): boolean {
  return a.kind === b.kind && (a.octaveShift ?? 0) === (b.octaveShift ?? 0);
}

const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [...SHARP_ORDER].reverse();

const TREBLE_SHARP_Y: readonly number[] = [0, 1.5, -0.5, 1, 2.5, 0.5, 2];
const TREBLE_FLAT_Y: readonly number[] = [2, 0.5, 2.5, 1, 3, 1.5, 3.5];

export function keyAlterations(key: KeySpec): ReadonlyMap<number, -1 | 1> {
  const map = new Map<number, -1 | 1>();
  const count = Math.min(7, Math.abs(key.fifths));
  const order = key.fifths >= 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < count; i += 1) map.set(order[i]!, key.fifths >= 0 ? 1 : -1);
  return map;
}

export function keyAlterOf(key: KeySpec, step: number): -1 | 0 | 1 {
  return keyAlterations(key).get(step) ?? 0;
}

function keyShift(clef: ClefSpec): number {
  const raw = (TOP_LINE_STEP[clef.kind] - TOP_LINE_STEP.treble) * 0.5;
  let best = raw;
  for (let k = -4; k <= 4; k += 1) {
    const candidate = raw + k * 3.5;
    if (Math.abs(candidate) < Math.abs(best)) best = candidate;
  }
  return best;
}

export interface KeyAccidental {
  step: number;
  alter: -1 | 1;
  glyph: string;
  y: number;
}

export function keySignature(key: KeySpec, clef: ClefSpec): readonly KeyAccidental[] {
  const count = Math.min(7, Math.abs(key.fifths));
  if (count === 0) return [];
  const sharps = key.fifths > 0;
  const order = sharps ? SHARP_ORDER : FLAT_ORDER;
  const pattern = sharps ? TREBLE_SHARP_Y : TREBLE_FLAT_Y;
  const shift = keyShift(clef);
  const out: KeyAccidental[] = [];
  for (let i = 0; i < count; i += 1) {
    const step = order[i]!;
    let y = pattern[i]! + shift;
    if (clef.kind === 'tenor' && sharps && y < 0) y += 3.5;
    out.push({ step, alter: sharps ? 1 : -1, glyph: sharps ? 'accidentalSharp' : 'accidentalFlat', y });
  }
  return out;
}

export function accidentalGlyph(alter: number): string {
  switch (alter) {
    case -2:
      return 'accidentalDoubleFlat';
    case -1:
      return 'accidentalFlat';
    case 1:
      return 'accidentalSharp';
    case 2:
      return 'accidentalDoubleSharp';
    default:
      return 'accidentalNatural';
  }
}

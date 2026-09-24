// Clef and key-signature geometry, shared by the vertical, accidentals and emit stages.
//
// Everything here is the coordinate system of architecture.md: origin at the top staff
// line, y increasing downward, 1 sp between adjacent staff lines, so the five lines sit
// at y = 0, 1, 2, 3, 4 and `staffPosition` and `y` are the same number.

import { stepIndex } from '../model/pitch.js';
import type { ClefSpec, KeySpec, Pitch } from '../model/types.js';

/** Staff lines, hence `y = 0..4`. */
export const STAFF_LINES = 5;
export const STAFF_HEIGHT = STAFF_LINES - 1;
export const MIDDLE_LINE = STAFF_HEIGHT / 2;

/** Diatonic step index of the pitch sitting on the top staff line (architecture.md). */
const TOP_LINE_STEP: Record<ClefSpec['kind'], number> = {
  treble: 38, // F5
  bass: 26, // A3
  alto: 32, // G4
  tenor: 30, // E4
};

/** Step index of the pitch each clef glyph names, used to place the glyph itself. */
const CLEF_ANCHOR_STEP: Record<ClefSpec['kind'], number> = {
  treble: 32, // G4
  bass: 24, // F3
  alto: 28, // C4
  tenor: 28, // C4
};

/**
 * An octave clef shifts `topLineStep` by ±7 (architecture.md). `Pitch` is the sounding
 * pitch, so an 8vb clef must place a pitch an octave lower where the plain clef would
 * place the octave above it — hence `+7 * octaveShift`, with `octaveShift: -1` lowering
 * the reference pitch.
 */
export function topLineStep(clef: ClefSpec): number {
  return TOP_LINE_STEP[clef.kind] + 7 * (clef.octaveShift ?? 0);
}

/** `y_sp = (topLineStep(clef) - stepIndex(pitch)) * 0.5` (architecture.md). */
export function staffPositionOf(p: Pitch, clef: ClefSpec): number {
  return (topLineStep(clef) - stepIndex(p)) * 0.5;
}

/** Inverse of `staffPositionOf`, ignoring `alter` — interaction.md's slot pitch. */
export function stepIndexAt(staffPosition: number, clef: ClefSpec): number {
  return topLineStep(clef) - staffPosition * 2;
}

export function clefGlyph(clef: ClefSpec): string {
  const shift = clef.octaveShift ?? 0;
  switch (clef.kind) {
    case 'treble':
      return shift === -1 ? 'gClef8vb' : shift === 1 ? 'gClef8va' : 'gClef';
    case 'bass':
      // The subset carries no fClef8va, so a bass clef an octave up falls back to the
      // plain glyph rather than rendering nothing (font.md's 58-glyph subset).
      return shift === -1 ? 'fClef8vb' : 'fClef';
    default:
      return 'cClef';
  }
}

/** y of the clef glyph's baseline: the line naming its own pitch — treble 3.0, bass 1.0,
 *  alto 2.0, tenor 1.0 (architecture.md). Independent of `octaveShift`: the glyph swaps,
 *  it does not move. */
export function clefGlyphY(clef: ClefSpec): number {
  return (TOP_LINE_STEP[clef.kind] - CLEF_ANCHOR_STEP[clef.kind]) * 0.5;
}

export function clefEquals(a: ClefSpec, b: ClefSpec): boolean {
  return a.kind === b.kind && (a.octaveShift ?? 0) === (b.octaveShift ?? 0);
}

// --- key signatures ---------------------------------------------------------

/** F C G D A E B as step numbers (C=0..B=6). Flats are the same array reversed. */
const SHARP_ORDER: readonly number[] = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER: readonly number[] = [...SHARP_ORDER].reverse();

/** Staff positions in treble, in accidental order (engraving.md "Key signatures"). */
const TREBLE_SHARP_Y: readonly number[] = [0, 1.5, -0.5, 1, 2.5, 0.5, 2];
const TREBLE_FLAT_Y: readonly number[] = [2, 0.5, 2.5, 1, 3, 1.5, 0];

/** Steps altered by a key, octave-agnostic (engraving.md's separate lookup). */
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

/**
 * Vertical offset from the canonical treble pattern for another clef. An octave is 7
 * steps = 3.5 sp, so the offset is only defined modulo 3.5; the representative closest
 * to zero is the one that keeps the signature on or near the staff, and it reproduces
 * engraving.md's table exactly: bass +1, alto +0.5, tenor -0.5 (before the tenor sharp
 * override below).
 */
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

/**
 * The accidentals a key signature draws, left to right.
 *
 * Tenor sharps are the one irregularity. engraving.md names them "F♯/C♯ placed an
 * octave down vs. naive derivation (avoids a ledger-line sharp)", but the naive tenor
 * C♯ already sits on the staff at y = 1.0 and moving it down lands it at 4.5, below the
 * bottom line — the very thing the rule exists to avoid. The accidentals that actually
 * need the octave in tenor are the ones the naive derivation puts above the top line:
 * F♯ (-0.5) and G♯ (-1.0, literally on a ledger line). Implemented to the stated intent
 * rather than the stated letters, which reproduces the conventional tenor signature
 * (F♯ 3.0, C♯ 1.0, G♯ 2.5, D♯ 0.5, A♯ 2.0, E♯ 0.0, B♯ 1.5).
 */
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

/** Glyph for a written alteration. */
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

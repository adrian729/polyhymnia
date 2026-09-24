// Pipeline stage 1 — normalize (architecture.md).
//
// Resolves clef/key/time per measure by inheriting forward from the staff defaults, and
// sanitizes whatever the caller handed us. Produces diagnostics, NEVER throws: the
// builders enforce their own invariants and may throw at authoring time, but a
// hand-built or deserialized `ScoreDoc` must degrade visibly in a live quiz rather than
// crash it (data-model.md).

import {
  timeCapacity,
  voiceLength,
  Rational as R,
  DEFAULT_DIVISIONS,
  DEFAULT_TIME,
  type ClefSpec,
  type Diagnostic,
  type KeySpec,
  type Measure,
  type ScoreDoc,
  type Staff,
  type TempoMap,
  type TimeSpec,
  type Voice,
} from '@polyhymnia/notation-model';
import type { Rational } from '@polyhymnia/notation-model';
import type { NotationOptions } from '../options.js';

export interface NormalizedMeasure {
  index: number;
  measure: Measure;
  /** Resolved — never undefined, whatever the source measure omitted. */
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  voices: readonly Voice[];
  pickup: boolean;
  /** Capacity in whole notes. For a pickup measure this is whatever its content sums
   *  to, not the meter's — it is exempt from the fullness rule (data-model.md). */
  capacity: Rational;
  capacityTicks: number;
}

export interface NormalizedStaff {
  index: number;
  staff: Staff;
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  measures: readonly NormalizedMeasure[];
}

export interface NormalizedScore {
  id: string;
  divisions: number;
  tempo: TempoMap;
  staves: readonly NormalizedStaff[];
  diagnostics: readonly Diagnostic[];
}

const DEFAULT_CLEF: ClefSpec = { kind: 'treble' };
const DEFAULT_KEY: KeySpec = { fifths: 0 };
const CLEF_KINDS = new Set(['treble', 'bass', 'alto', 'tenor']);

export function normalize(doc: ScoreDoc, _options?: NotationOptions): NormalizedScore {
  const diagnostics: Diagnostic[] = [];
  const source = (doc ?? {}) as Partial<ScoreDoc>;

  const divisions = resolveDivisions(source.divisions, diagnostics);
  const staves = Array.isArray(source.staves) ? source.staves : [];
  if (staves.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'no-staves',
      message: 'Score has no staves; nothing to lay out.',
    });
  }

  return {
    id: typeof source.id === 'string' ? source.id : 'score',
    divisions,
    tempo: Array.isArray(source.tempo) ? source.tempo : [],
    staves: staves.map((staff, index) => normalizeStaff(staff, index, divisions, diagnostics)),
    diagnostics,
  };
}

function normalizeStaff(
  staff: Staff,
  staffIndex: number,
  divisions: number,
  diagnostics: Diagnostic[],
): NormalizedStaff {
  const source = (staff ?? {}) as Partial<Staff>;
  const clef = resolveClef(source.clef, DEFAULT_CLEF);
  const key = resolveKey(source.key, DEFAULT_KEY);
  const time = resolveTime(source.time, DEFAULT_TIME, undefined, diagnostics);

  const measures = Array.isArray(source.measures) ? source.measures : [];
  let currentClef = clef;
  let currentKey = key;
  let currentTime = time;

  const normalized = measures.map((measure, index) => {
    const m = (measure ?? {}) as Partial<Measure>;
    // Absent = inherit from the previous measure (data-model.md).
    currentClef = m.clef ? resolveClef(m.clef, currentClef) : currentClef;
    currentKey = m.key ? resolveKey(m.key, currentKey) : currentKey;
    currentTime = m.time ? resolveTime(m.time, currentTime, index, diagnostics) : currentTime;

    const voices = resolveVoices(m.voices, index, diagnostics);
    const pickup = m.pickup === true;
    const meterCapacity = capacityOf(currentTime);
    // A pickup measure's capacity is simply what its content sums to.
    const capacity = pickup ? pickupCapacity(voices, meterCapacity) : meterCapacity;

    return {
      index,
      measure: measure ?? { id: `m${index}` as Measure['id'], voices: [] },
      clef: currentClef,
      key: currentKey,
      time: currentTime,
      voices,
      pickup,
      capacity,
      capacityTicks: R.toTicks(capacity, divisions),
    } satisfies NormalizedMeasure;
  });

  return { index: staffIndex, staff: source as Staff, clef, key, time, measures: normalized };
}

function resolveDivisions(value: unknown, diagnostics: Diagnostic[]): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (value !== undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-divisions',
      message: `Invalid divisions ${JSON.stringify(value)}; using ${DEFAULT_DIVISIONS}.`,
    });
  }
  return DEFAULT_DIVISIONS;
}

function resolveClef(value: unknown, fallback: ClefSpec): ClefSpec {
  const clef = value as Partial<ClefSpec> | undefined;
  if (!clef || typeof clef.kind !== 'string' || !CLEF_KINDS.has(clef.kind)) return fallback;
  const shift = clef.octaveShift;
  return shift === -1 || shift === 1 ? { kind: clef.kind, octaveShift: shift } : { kind: clef.kind };
}

function resolveKey(value: unknown, fallback: KeySpec): KeySpec {
  const key = value as Partial<KeySpec> | undefined;
  if (!key || typeof key.fifths !== 'number') return fallback;
  const fifths = Math.max(-7, Math.min(7, Math.round(key.fifths))) as KeySpec['fifths'];
  return key.mode ? { fifths, mode: key.mode } : { fifths };
}

function resolveTime(
  value: unknown,
  fallback: TimeSpec,
  measureIndex: number | undefined,
  diagnostics: Diagnostic[],
): TimeSpec {
  const time = value as Partial<TimeSpec> | undefined;
  const beats = time?.beats;
  const beatType = time?.beatType;
  const valid =
    typeof beats === 'number' &&
    Number.isFinite(beats) &&
    beats > 0 &&
    typeof beatType === 'number' &&
    Number.isFinite(beatType) &&
    beatType > 0;
  if (!valid) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-time-signature',
      message: `Invalid time signature ${JSON.stringify(value)}; inheriting ${fallback.beats}/${fallback.beatType}.`,
      ...(measureIndex !== undefined ? { measureIndex } : {}),
    });
    return fallback;
  }
  const resolved: TimeSpec = { beats: Math.round(beats), beatType: Math.round(beatType) };
  if (time?.symbol) resolved.symbol = time.symbol;
  if (Array.isArray(time?.beatGrouping)) resolved.beatGrouping = time.beatGrouping;
  return resolved;
}

function resolveVoices(
  value: unknown,
  measureIndex: number,
  diagnostics: Diagnostic[],
): readonly Voice[] {
  const voices = Array.isArray(value) ? (value as Voice[]) : [];
  if (!Array.isArray(value)) {
    diagnostics.push({
      severity: 'warning',
      code: 'missing-voices',
      message: `Measure ${measureIndex} has no voices array; treated as empty.`,
      measureIndex,
    });
  }
  const kept = voices.slice(0, 2);
  if (voices.length > 2) {
    diagnostics.push({
      severity: 'warning',
      code: 'too-many-voices',
      message: `Measure ${measureIndex} has ${voices.length} voices; only 2 are supported, the rest were dropped.`,
      measureIndex,
    });
  }
  return kept.map((voice, i) => {
    const v = (voice ?? {}) as Partial<Voice>;
    const index = v.index === 1 ? 1 : v.index === 0 ? 0 : ((i === 1 ? 1 : 0) as 0 | 1);
    return {
      id: v.id ?? (`v${measureIndex}-${i}` as Voice['id']),
      index,
      elements: Array.isArray(v.elements) ? v.elements : [],
    };
  });
}

function capacityOf(time: TimeSpec): Rational {
  try {
    return timeCapacity(time.beats, time.beatType);
  } catch {
    return timeCapacity(DEFAULT_TIME.beats, DEFAULT_TIME.beatType);
  }
}

/** Longest voice wins, so a pickup with a rest in voice 1 still measures correctly. */
function pickupCapacity(voices: readonly Voice[], meterCapacity: Rational): Rational {
  let capacity = R.ZERO;
  for (const v of voices) {
    capacity = R.max(capacity, voiceLength(v.elements, meterCapacity));
  }
  return capacity;
}

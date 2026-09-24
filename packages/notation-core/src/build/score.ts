// Structure builders (interface.md "## Content authoring").
//
// These are the one place in the system allowed to throw: an overfull measure is a
// hard build error, because it can only come from source the author is writing right
// now. Everything downstream of `ScoreDoc` (normalize, temporal, the rest of the
// pipeline) degrades with a diagnostic instead — a malformed score must not crash a
// live quiz.

import {
  decomposeLength,
  timeCapacity,
  voiceLength,
} from '../model/duration.js';
import { asMeasureId, asVoiceId, createId } from '../model/ids.js';
import * as R from '../model/rational.js';
import type { Rational } from '../model/rational.js';
import {
  DEFAULT_DIVISIONS,
  DEFAULT_TIME,
  type ClefSpec,
  type Diagnostic,
  type KeySpec,
  type Measure,
  type MeasureId,
  type ScoreDoc,
  type Staff,
  type TempoMap,
  type TimeSpec,
  type Voice,
  type VoiceElement,
} from '../model/types.js';
import { rest, voiceHintOf } from './note.js';

export interface ScoreConfig {
  clef: ClefSpec['kind'];
  key?: KeySpec['fifths'];
  time?: TimeSpec;
  // Additive over interface.md's listed set — `ScoreDoc` requires both and neither has
  // a token form.
  divisions?: number;
  tempo?: TempoMap;
  id?: string;
  octaveShift?: ClefSpec['octaveShift'];
}

export interface MeasureConfig {
  clef?: ClefSpec['kind'];
  key?: KeySpec['fifths'];
  time?: TimeSpec;
  systemBreak?: boolean;
  pickup?: boolean;
  id?: MeasureId;
  barlineEnd?: Measure['barlineEnd'];
  barlineStart?: Measure['barlineStart'];
  octaveShift?: ClefSpec['octaveShift'];
}

export type MeasureContent =
  | VoiceElement
  | Voice
  | readonly (VoiceElement | Voice)[];

export { DEFAULT_TIME } from '../model/types.js';

/** An overfull measure — the single throwing path in the whole system. */
export class BuildError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = 'BuildError';
    this.diagnostic = diagnostic;
  }
}

// `ScoreDoc` has no diagnostics field (it is the serialized score, not a layout
// result), so builder warnings ride alongside the object they describe.
const DIAGNOSTICS = new WeakMap<object, Diagnostic[]>();

/** Warnings produced while building this score or measure (e.g. an auto-padded bar). */
export function buildDiagnostics(target: ScoreDoc | Measure): readonly Diagnostic[] {
  return DIAGNOSTICS.get(target) ?? [];
}

function attachDiagnostics(target: object, diagnostics: readonly Diagnostic[]): void {
  if (diagnostics.length > 0) DIAGNOSTICS.set(target, [...diagnostics]);
}

// --- measure ----------------------------------------------------------------

export function measure(...content: MeasureContent[]): Measure;
export function measure(config: MeasureConfig, ...content: MeasureContent[]): Measure;
export function measure(...args: (MeasureConfig | MeasureContent)[]): Measure {
  const [head, ...tail] = args;
  const config: MeasureConfig = isMeasureConfig(head) ? head : {};
  const content = (isMeasureConfig(head) ? tail : args) as MeasureContent[];

  const built: Measure = {
    id: config.id ?? asMeasureId(createId('m')),
    voices: collectVoices(content),
  };
  if (config.clef) {
    built.clef = config.octaveShift
      ? { kind: config.clef, octaveShift: config.octaveShift }
      : { kind: config.clef };
  }
  if (config.key !== undefined) built.key = { fifths: config.key };
  if (config.time) built.time = config.time;
  if (config.barlineEnd) built.barlineEnd = config.barlineEnd;
  if (config.barlineStart) built.barlineStart = config.barlineStart;
  if (config.pickup) built.pickup = true;
  if (config.systemBreak) built.systemBreak = true;

  // The fullness rule needs the prevailing meter, which only `score()` can resolve by
  // inheriting forward. When this measure states its own, enforce it right here so the
  // error points at the offending call; otherwise `score()` does it. Enforcement is
  // idempotent — a padded measure is exactly full, so the second pass is a no-op.
  if (built.time) {
    const result = enforceFullness(built, built.time, undefined);
    attachDiagnostics(result.measure, result.diagnostics);
    return result.measure;
  }
  return built;
}

function isMeasureConfig(value: unknown): value is MeasureConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('kind' in value) &&
    !('elements' in value)
  );
}

function isVoice(value: VoiceElement | Voice): value is Voice {
  return 'elements' in value;
}

/** Loose elements land in the voice named by their `opts.voice` hint, default 0. */
function collectVoices(content: readonly MeasureContent[]): Voice[] {
  const byIndex = new Map<0 | 1, { id?: string; elements: VoiceElement[] }>();
  const bucket = (index: 0 | 1) => {
    let entry = byIndex.get(index);
    if (!entry) {
      entry = { elements: [] };
      byIndex.set(index, entry);
    }
    return entry;
  };

  for (const item of content.flat() as (VoiceElement | Voice)[]) {
    if (isVoice(item)) {
      const entry = bucket(item.index);
      entry.id ??= item.id;
      entry.elements.push(...item.elements);
    } else {
      bucket(voiceHintOf(item) ?? 0).elements.push(item);
    }
  }
  if (byIndex.size === 0) bucket(0);

  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, entry]) => ({
      id: asVoiceId(entry.id ?? createId('v')),
      index,
      elements: entry.elements,
    }));
}

// --- fullness rule ----------------------------------------------------------

interface FullnessResult {
  measure: Measure;
  diagnostics: Diagnostic[];
}

/**
 * Every tick of a measure must be covered by a note or a rest — no implicit gaps
 * (data-model.md). Underfull auto-pads a trailing rest plus a warning; overfull throws.
 * `pickup: true` is exempt from both: its capacity is simply whatever it sums to.
 */
function enforceFullness(
  m: Measure,
  time: TimeSpec,
  measureIndex: number | undefined,
): FullnessResult {
  if (m.pickup) return { measure: m, diagnostics: [] };

  const capacity = safeCapacity(time);
  const where = measureIndex === undefined ? 'Measure' : `Measure ${measureIndex}`;
  const at = measureIndex === undefined ? {} : { measureIndex };
  const diagnostics: Diagnostic[] = [];
  let changed = false;
  const voices = m.voices.map((v) => {
    const total = voiceLength(v.elements, capacity);
    const cmp = R.compare(total, capacity);
    if (cmp === 0) return v;

    if (cmp > 0) {
      throw new BuildError({
        severity: 'error',
        code: 'measure-overfull',
        message:
          `${where} voice ${v.index} is overfull: ` +
          `${describeLength(total)} of content in a ${time.beats}/${time.beatType} bar ` +
          `(capacity ${describeLength(capacity)}).`,
        ...at,
        voice: v.index,
      });
    }

    const padding = decomposeLength(R.subtract(capacity, total)).map((d) => rest(d));
    if (padding.length === 0) return v;
    changed = true;
    diagnostics.push({
      severity: 'warning',
      code: 'measure-underfull',
      message:
        `${where} voice ${v.index} was underfull ` +
        `(${describeLength(total)} of ${describeLength(capacity)}); ` +
        `padded with ${padding.length} rest(s).`,
      ...at,
      voice: v.index,
    });
    return { ...v, elements: [...v.elements, ...padding] };
  });

  return { measure: changed ? { ...m, voices } : m, diagnostics };
}

/** Capacity in whole notes. A nonsensical meter falls back to 4/4 rather than throwing
 *  — `normalize` reports it as a diagnostic on the layout side. */
function safeCapacity(time: TimeSpec): Rational {
  try {
    return timeCapacity(time.beats, time.beatType);
  } catch {
    return timeCapacity(DEFAULT_TIME.beats, DEFAULT_TIME.beatType);
  }
}

function describeLength(length: Rational): string {
  return `${length.n}/${length.d} whole notes`;
}

// --- score ------------------------------------------------------------------

/**
 * Assemble measures into a `ScoreDoc`, inheriting clef/key/time forward the same way
 * `normalize` (pipeline stage 1) does for hand-built documents, and enforcing the
 * fullness rule against each measure's resolved meter.
 */
export function score(config: ScoreConfig, ...measures: Measure[]): ScoreDoc {
  const clef: ClefSpec = config.octaveShift
    ? { kind: config.clef, octaveShift: config.octaveShift }
    : { kind: config.clef };
  const key: KeySpec = { fifths: config.key ?? 0 };
  const time: TimeSpec = config.time ?? DEFAULT_TIME;

  const diagnostics: Diagnostic[] = [];
  let currentTime = time;
  const resolved = measures.map((m, index) => {
    currentTime = m.time ?? currentTime;
    const carried = buildDiagnostics(m).map((d) => ({ ...d, measureIndex: index }));
    const result = enforceFullness(m, currentTime, index);
    diagnostics.push(...carried, ...result.diagnostics);
    return result.measure;
  });

  const staff: Staff = {
    id: createId('staff'),
    clef,
    key,
    time,
    measures: resolved,
  };

  const doc: ScoreDoc = {
    id: config.id ?? createId('score'),
    divisions: normalizeDivisions(config.divisions),
    staves: [staff],
    tempo: config.tempo ?? [],
  };
  attachDiagnostics(doc, diagnostics);
  return doc;
}

function normalizeDivisions(divisions: number | undefined): number {
  if (divisions === undefined) return DEFAULT_DIVISIONS;
  if (!Number.isInteger(divisions) || divisions <= 0) return DEFAULT_DIVISIONS;
  return divisions;
}

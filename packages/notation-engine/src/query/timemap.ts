// playback.md's `TimeMap` — notation time <-> audio time, and tick -> screen position.
//
// The temporal stage already computed exact onsets; this module adds what playback needs
// on top of them: tie merging (a tied pair is ONE entry, so the sampler starts one
// sound), MIDI numbers, and the sp coordinates only the emit stage knows.

import { Rational as R } from '@polyhymnia/notation-model';
import { midiOf, noteValueSpecLength, type NoteId, type NoteValueSpec, type TempoMap } from '../layout/records.js';
import type { TemporalElement } from '../layout/temporal.js';
import type { SystemBox } from '../layout/types.js';

export interface TimeMapEntry {
  /** Every member NoteId — length 1 for a note or rest, N for a chord. Mirrors
   *  `ElementBox`'s per-member addressing (architecture.md). */
  ids: readonly NoteId[];
  tick: number;
  durationTicks: number;
  measureIndex: number;
  voice: 0 | 1;
  systemIndex: number;
  x: number;
  y: number;
  midi?: number;
  midiNotes?: readonly number[];
  kind: 'note' | 'chord' | 'rest';
}

export interface MeasureTime {
  index: number;
  startTick: number;
  endTick: number;
  systemIndex: number;
  x: number;
  w: number;
}

export interface TimeMap {
  divisions: number;
  entries: readonly TimeMapEntry[];
  measures: readonly MeasureTime[];
  tempo: TempoMap;
  tickToSeconds(tick: number): number;
  secondsToTick(seconds: number): number;
  positionAtTick(
    tick: number,
  ): { systemIndex: number; x: number; yTop: number; yBottom: number } | null;
  activeAt(tick: number): readonly NoteId[];
  byId(id: NoteId): TimeMapEntry | undefined;
}

export interface Placement {
  systemIndex: number;
  x: number;
  y: number;
}

export interface TimeMapInput {
  divisions: number;
  tempo: TempoMap;
  /** The elements actually laid out, in tick order. */
  elements: readonly TemporalElement[];
  /** Keyed by `TemporalElement.id` — the chord's own id for a chord. */
  placement: ReadonlyMap<NoteId, Placement>;
  measures: readonly MeasureTime[];
  systems: readonly SystemBox[];
}

/** playback.md leaves an empty `TempoMap` to the implementation; 120 bpm on the quarter
 *  is the conventional default and the one an exercise plays at. */
export const DEFAULT_TEMPO_BPM = 120;
const DEFAULT_BEAT_UNIT: NoteValueSpec = { base: 'quarter', dots: 0 };

export function buildTimeMap(input: TimeMapInput): TimeMap {
  const entries = buildEntries(input);
  const writtenSpans = buildWrittenSpans(input);
  const segments = buildTempoSegments(input.tempo, input.divisions);
  const measures = [...input.measures].sort((a, b) => a.startTick - b.startTick);
  const byTick = [...entries].sort((a, b) => a.tick - b.tick);

  const tickToSeconds = (tick: number): number => {
    const t = Math.max(0, tick);
    let segment = segments[0]!;
    for (const candidate of segments) {
      if (candidate.tick <= t) segment = candidate;
      else break;
    }
    return segment.seconds + (t - segment.tick) * segment.secondsPerTick;
  };

  const secondsToTick = (seconds: number): number => {
    const s = Math.max(0, seconds);
    let segment = segments[0]!;
    for (const candidate of segments) {
      if (candidate.seconds <= s) segment = candidate;
      else break;
    }
    return segment.tick + (s - segment.seconds) / segment.secondsPerTick;
  };

  const systemOf = (index: number): SystemBox | undefined =>
    input.systems.find((s) => s.index === index);

  /**
   * Piecewise-linear between column x positions, timed so the cursor reaches a column
   * exactly when it sounds — not time-proportional, because spacing follows the power
   * law in engraving.md and proportional motion drifts off the noteheads (playback.md).
   */
  const positionAtTick: TimeMap['positionAtTick'] = (tick) => {
    if (byTick.length === 0) return null;
    const first = byTick[0]!;
    if (tick <= first.tick) return at(first.systemIndex, first.x);

    for (let i = 0; i < byTick.length; i += 1) {
      const entry = byTick[i]!;
      const end = entry.tick + entry.durationTicks;
      if (tick >= end && i < byTick.length - 1) continue;
      const next = byTick[i + 1];
      const span = Math.max(1, (next ? next.tick : end) - entry.tick);
      const ratio = Math.min(1, Math.max(0, (tick - entry.tick) / span));
      const system = systemOf(entry.systemIndex);
      // A next column on another system runs out to this system's right edge instead of
      // interpolating backwards across the line break.
      const targetX =
        next && next.systemIndex === entry.systemIndex
          ? next.x
          : (system ? system.x + system.w : entry.x);
      return at(entry.systemIndex, entry.x + (targetX - entry.x) * ratio);
    }
    const last = byTick[byTick.length - 1]!;
    return at(last.systemIndex, last.x);
  };

  function at(systemIndex: number, x: number) {
    const system = systemOf(systemIndex);
    return {
      systemIndex,
      x,
      yTop: system ? system.y : 0,
      yBottom: system ? system.y + system.h : 0,
    };
  }

  return {
    divisions: input.divisions,
    entries,
    measures,
    tempo: input.tempo,
    tickToSeconds,
    secondsToTick,
    positionAtTick,
    activeAt(tick) {
      const ids: NoteId[] = [];
      for (const span of writtenSpans) {
        if (tick >= span.tick && tick < span.tick + span.durationTicks) ids.push(...span.ids);
      }
      return ids;
    },
    byId(id) {
      return entries.find((entry) => entry.ids.includes(id));
    },
  };
}

// --- entries ----------------------------------------------------------------

function orderElements(input: TimeMapInput): TemporalElement[] {
  return [...input.elements].sort((a, b) => a.tick - b.tick || a.voice - b.voice);
}

function toEntry(head: TemporalElement, input: TimeMapInput, durationTicks: number): TimeMapEntry {
  const place = input.placement.get(head.id);
  const notes = head.notes;
  return {
    ids: notes.length > 0 ? notes.map((n) => n.id) : [head.id],
    tick: head.tick,
    durationTicks,
    measureIndex: head.measureIndex,
    voice: head.voice,
    systemIndex: place?.systemIndex ?? 0,
    x: place?.x ?? 0,
    y: place?.y ?? 0,
    kind: head.kind,
    ...(head.kind === 'note' && notes[0] ? { midi: midiOf(notes[0].pitch) } : {}),
    ...(head.kind === 'chord'
      ? { midiNotes: notes.map((n) => midiOf(n.pitch)) }
      : {}),
  };
}

function buildEntries(input: TimeMapInput): TimeMapEntry[] {
  const ordered = orderElements(input);
  const entries: TimeMapEntry[] = [];

  let i = 0;
  while (i < ordered.length) {
    const head = ordered[i]!;
    let last = i;
    // Tie merging: a tied pair is one entry (playback.md), so a sampler starts one sound.
    while (
      last + 1 < ordered.length &&
      tiesInto(ordered[last]!, ordered[last + 1]!)
    ) {
      last += 1;
    }
    const durationTicks = ordered
      .slice(i, last + 1)
      .reduce((sum, e) => sum + e.durationTicks, 0);
    entries.push(toEntry(head, input, durationTicks));
    i = last + 1;
  }

  return entries;
}

function buildWrittenSpans(input: TimeMapInput): TimeMapEntry[] {
  return orderElements(input).map((el) => toEntry(el, input, el.durationTicks));
}

function tiesInto(a: TemporalElement, b: TemporalElement): boolean {
  if (a.voice !== b.voice) return false;
  if (a.tick + a.durationTicks !== b.tick) return false;
  const from = a.notes;
  const to = b.notes;
  if (from.length === 0 || from.length !== to.length) return false;
  if (!from.every((n) => n.tie === 'start' || n.tie === 'continue')) return false;
  if (!to.every((n) => n.tie === 'stop' || n.tie === 'continue')) return false;
  return from.every((n, i) => samePitch(n, to[i]!));
}

function samePitch(a: TemporalElement['notes'][number], b: TemporalElement['notes'][number]): boolean {
  return (
    a.pitch.step === b.pitch.step &&
    a.pitch.alter === b.pitch.alter &&
    a.pitch.octave === b.pitch.octave
  );
}

// --- tempo ------------------------------------------------------------------

interface TempoSegment {
  tick: number;
  seconds: number;
  secondsPerTick: number;
}

function buildTempoSegments(tempo: TempoMap, divisions: number): TempoSegment[] {
  const events = [...(tempo ?? [])]
    .filter((e) => Number.isFinite(e?.bpm) && e.bpm > 0)
    .sort((a, b) => a.tick - b.tick);
  if (events.length === 0 || (events[0]?.tick ?? 0) > 0) {
    events.unshift({ tick: 0, bpm: DEFAULT_TEMPO_BPM, beatUnit: DEFAULT_BEAT_UNIT });
  }

  const segments: TempoSegment[] = [];
  let seconds = 0;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!;
    const tick = Math.max(0, event.tick);
    const secondsPerTick = 60 / (event.bpm * ticksPerBeat(event.beatUnit, divisions));
    if (i > 0) {
      const previous = segments[segments.length - 1]!;
      seconds = previous.seconds + (tick - previous.tick) * previous.secondsPerTick;
    }
    segments.push({ tick, seconds, secondsPerTick });
  }
  return segments;
}

function ticksPerBeat(beatUnit: NoteValueSpec | undefined, divisions: number): number {
  const quarters = R.toNumber(noteValueSpecLength(beatUnit ?? DEFAULT_BEAT_UNIT)) * 4;
  return divisions * quarters;
}

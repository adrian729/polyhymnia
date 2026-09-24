// Pipeline stage 2 — temporal (architecture.md).
//
// Onset and duration ticks for every element, computed with exact rational arithmetic
// and collapsed to integer ticks only at the boundary. This is where the timemap is
// born: `query/timemap.ts` derives playback.md's `TimeMap` (tie merging, MIDI numbers,
// sp coordinates from the emit stage) from the `TemporalElement` rows below — that
// module is deliberately not this stage's job, because those extras need layout
// geometry this stage has not computed yet.
//
// Never throws. The fullness policy here is the degrade path for documents that do not
// fill their measures: underfull pads with a warning, overfull truncates at the barline
// with an error.

import { Rational as R } from '@polyhymnia/notation-model';
import type { Diagnostic, Rational } from '@polyhymnia/notation-model';
import type { NotationOptions } from '../options.js';
import type { NormalizedEvent, NormalizedMeasure, NormalizedScore } from './normalize.js';
import {
  decomposeLength,
  noteValueSpecLength,
  type DurationBase,
  type NoteId,
  type TupletRef,
} from './records.js';

export type { ElementNote } from './normalize.js';
import type { ElementNote } from './normalize.js';
export interface TemporalElement {
  id: NoteId;
  kind: 'note' | 'chord' | 'rest';
  base: DurationBase;
  dots: 0 | 1 | 2;
  tuplet?: TupletRef;
  /** One entry for a note, N for a chord's members, none for a rest. */
  notes: readonly ElementNote[];
  stem?: 'auto' | 'up' | 'down' | 'none';
  breath?: 'comma' | 'caesura';
  /** Draws one whole-rest glyph and takes the measure's full capacity in ticks. */
  wholeBar?: boolean;
  staffPosition?: number;
  staffIndex: number;
  measureIndex: number;
  voice: 0 | 1;
  /** Absolute onset from the start of the score. */
  tick: number;
  /** Onset relative to the start of its own measure. */
  measureTick: number;
  durationTicks: number;
  /** True for a rest this stage inserted to cover an underfull bar. */
  synthetic?: boolean;
}

export interface TemporalMeasure {
  index: number;
  staffIndex: number;
  startTick: number;
  endTick: number;
  capacityTicks: number;
}

export interface TemporalScore {
  divisions: number;
  measures: readonly TemporalMeasure[];
  elements: readonly TemporalElement[];
  diagnostics: readonly Diagnostic[];
}

export function temporal(normalized: NormalizedScore, _options?: NotationOptions): TemporalScore {
  const { divisions } = normalized;
  const elements: TemporalElement[] = [];
  const measures: TemporalMeasure[] = [];
  const diagnostics: Diagnostic[] = [];
  const usedIds = new Set(normalized.usedIds);

  for (const staff of normalized.staves) {
    let measureStart = R.ZERO;
    for (const measure of staff.measures) {
      const startTick = R.toTicks(measureStart, divisions);
      for (const voice of measure.voices) {
        walkVoice(
          measure,
          voice.index,
          voice.events,
          staff.index,
          measureStart,
          divisions,
          elements,
          diagnostics,
          usedIds,
        );
      }
      measures.push({
        index: measure.index,
        staffIndex: staff.index,
        startTick,
        endTick: startTick + measure.capacityTicks,
        capacityTicks: measure.capacityTicks,
      });
      measureStart = R.add(measureStart, measure.capacity);
    }
  }

  return { divisions, measures, elements, diagnostics };
}

function walkVoice(
  measure: NormalizedMeasure,
  voiceIndex: 0 | 1,
  events: readonly NormalizedEvent[],
  staffIndex: number,
  measureStart: Rational,
  divisions: number,
  out: TemporalElement[],
  diagnostics: Diagnostic[],
  usedIds: Set<string>,
): void {
  const { capacity, index: measureIndex } = measure;
  const wholeBarLength = wholeBarShare(events, capacity);
  let onset = R.ZERO;
  let truncated = false;

  for (const ev of events) {
    const length = ev.kind === 'rest' && ev.wholeBar ? wholeBarLength : ev.length;
    if (R.compare(length, R.ZERO) <= 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'zero-length-element',
        message: `Measure ${measureIndex} voice ${voiceIndex} has an element with no duration; skipped.`,
        measureIndex,
        voice: voiceIndex,
        tick: R.toTicks(R.add(measureStart, onset), divisions),
      });
      continue;
    }

    if (!measure.pickup && R.compare(onset, capacity) >= 0) {
      truncated = true;
      continue;
    }
    let effective = length;
    if (!measure.pickup && R.compare(R.add(onset, length), capacity) > 0) {
      effective = R.subtract(capacity, onset);
      truncated = true;
    }

    if (ev.kind !== 'space') {
      out.push({
        id: ev.id,
        kind: ev.kind,
        base: ev.base,
        dots: ev.dots,
        ...(ev.tuplet ? { tuplet: ev.tuplet } : {}),
        notes: ev.notes,
        ...(ev.stem ? { stem: ev.stem } : {}),
        ...(ev.breath ? { breath: ev.breath } : {}),
        ...(ev.wholeBar ? { wholeBar: true } : {}),
        ...(ev.staffPosition !== undefined ? { staffPosition: ev.staffPosition } : {}),
        staffIndex,
        measureIndex,
        voice: voiceIndex,
        tick: R.toTicks(R.add(measureStart, onset), divisions),
        measureTick: R.toTicks(onset, divisions),
        durationTicks: R.toTicks(effective, divisions),
      });
    }
    onset = R.add(onset, length);
  }

  if (truncated) {
    diagnostics.push({
      severity: 'error',
      code: 'measure-overfull',
      message:
        `Measure ${measureIndex} voice ${voiceIndex} overflows its ` +
        `${measure.time.beats}/${measure.time.beatType} capacity; truncated at the barline.`,
      measureIndex,
      voice: voiceIndex,
      tick: R.toTicks(R.add(measureStart, capacity), divisions),
    });
    return;
  }

  if (measure.pickup || R.compare(onset, capacity) >= 0) return;
  const padding = decomposeLength(R.subtract(capacity, onset));
  if (padding.length === 0) return;
  diagnostics.push({
    severity: 'warning',
    code: 'measure-underfull',
    message:
      `Measure ${measureIndex} voice ${voiceIndex} does not fill its ` +
      `${measure.time.beats}/${measure.time.beatType} capacity; padded with ` +
      `${padding.length} rest(s).`,
    measureIndex,
    voice: voiceIndex,
    tick: R.toTicks(R.add(measureStart, onset), divisions),
  });
  padding.forEach((value, k) => {
    const length = noteValueSpecLength(value);
    const candidate = `m${measureIndex}.v${voiceIndex}.pad${k}`;
    let id = candidate;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${candidate}~${n}`;
      n += 1;
    }
    if (id !== candidate) {
      diagnostics.push({
        severity: 'warning',
        code: 'id-collision',
        message: `Synthesized id ${JSON.stringify(candidate)} collides with an existing id; using ${JSON.stringify(id)} instead.`,
        measureIndex,
        voice: voiceIndex,
        tick: R.toTicks(R.add(measureStart, onset), divisions),
      });
    }
    usedIds.add(id);
    out.push({
      id,
      kind: 'rest',
      base: value.base,
      dots: value.dots,
      notes: [],
      staffIndex,
      measureIndex,
      voice: voiceIndex,
      tick: R.toTicks(R.add(measureStart, onset), divisions),
      measureTick: R.toTicks(onset, divisions),
      durationTicks: R.toTicks(length, divisions),
      synthetic: true,
    });
    onset = R.add(onset, length);
  });
}

function wholeBarShare(events: readonly NormalizedEvent[], capacity: Rational): Rational {
  let others = R.ZERO;
  let wholeBarCount = 0;
  for (const ev of events) {
    if (ev.kind === 'rest' && ev.wholeBar) wholeBarCount += 1;
    else others = R.add(others, ev.length);
  }
  const remainder = R.max(R.ZERO, R.subtract(capacity, others));
  return R.divide(remainder, R.of(Math.max(1, wholeBarCount)));
}

// Pipeline stage 2 — temporal (architecture.md).
//
// Onset and duration ticks for every element, computed with exact rational arithmetic
// and collapsed to integer ticks only at the boundary. This is where the timemap is
// born: `query/timemap.ts` derives playback.md's `TimeMap` (tie merging, MIDI numbers,
// sp coordinates from the emit stage) from the `TemporalElement` rows below — that
// module is deliberately not this stage's job, because those extras need layout
// geometry this stage has not computed yet.
//
// Never throws. The fullness policy here is the degrade path for hand-built documents:
// underfull pads, overfull truncates at the barline, both with a diagnostic
// (data-model.md). The builders' hard error is the authoring-time counterpart.

import { decomposeLength, durationToRational, isWholeBarRest } from '../model/duration.js';
import { asNoteId, createId } from '../model/ids.js';
import * as R from '../model/rational.js';
import type { Rational } from '../model/rational.js';
import type { NotationOptions } from '../model/options.js';
import type { Diagnostic, NoteId, RestEl, VoiceElement } from '../model/types.js';
import type { NormalizedMeasure, NormalizedScore } from './normalize.js';

export interface TemporalElement {
  id: NoteId;
  kind: 'note' | 'chord' | 'rest';
  element: VoiceElement;
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

  for (const staff of normalized.staves) {
    let measureStart = R.ZERO;
    for (const measure of staff.measures) {
      const startTick = R.toTicks(measureStart, divisions);
      for (const voice of measure.voices) {
        walkVoice(
          measure,
          voice.index,
          voice.elements,
          staff.index,
          measureStart,
          divisions,
          elements,
          diagnostics,
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
  voiceElements: readonly VoiceElement[],
  staffIndex: number,
  measureStart: Rational,
  divisions: number,
  out: TemporalElement[],
  diagnostics: Diagnostic[],
): void {
  const { capacity, index: measureIndex } = measure;
  let onset = R.ZERO;
  let truncated = false;

  for (const el of voiceElements) {
    const length = lengthOf(el, voiceElements, capacity);
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

    // Overfull: truncate at the barline, drop the excess (data-model.md).
    if (!measure.pickup && R.compare(onset, capacity) >= 0) {
      truncated = true;
      continue;
    }
    let effective = length;
    if (!measure.pickup && R.compare(R.add(onset, length), capacity) > 0) {
      effective = R.subtract(capacity, onset);
      truncated = true;
    }

    out.push({
      id: el.id,
      kind: el.kind,
      element: el,
      staffIndex,
      measureIndex,
      voice: voiceIndex,
      tick: R.toTicks(R.add(measureStart, onset), divisions),
      measureTick: R.toTicks(onset, divisions),
      durationTicks: R.toTicks(effective, divisions),
    });
    onset = R.add(onset, length);
  }

  if (truncated) {
    diagnostics.push({
      severity: 'warning',
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

  // Underfull: auto-pad a trailing rest (data-model.md). A pickup measure is exempt —
  // its capacity is defined as whatever its content sums to.
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
  for (const duration of padding) {
    const restEl: RestEl = { kind: 'rest', id: asNoteId(createId('pad')), duration };
    const length = durationToRational(duration);
    out.push({
      id: restEl.id,
      kind: 'rest',
      element: restEl,
      staffIndex,
      measureIndex,
      voice: voiceIndex,
      tick: R.toTicks(R.add(measureStart, onset), divisions),
      measureTick: R.toTicks(onset, divisions),
      durationTicks: R.toTicks(length, divisions),
      synthetic: true,
    });
    onset = R.add(onset, length);
  }
}

/**
 * A `wholeBar` rest is the only element whose tick length is not derived from its
 * `Duration` — that is pinned to 'whole' for rendering whatever the meter, while the
 * length is the capacity the rest of the voice leaves over (data-model.md's
 * "the only place in the model a rendered duration and its tick length intentionally
 * diverge").
 */
function lengthOf(
  el: VoiceElement,
  siblings: readonly VoiceElement[],
  capacity: Rational,
): Rational {
  if (!isWholeBarRest(el)) return durationToRational(el.duration);
  let others = R.ZERO;
  let wholeBarCount = 0;
  for (const other of siblings) {
    if (isWholeBarRest(other)) wholeBarCount += 1;
    else others = R.add(others, durationToRational(other.duration));
  }
  const remainder = R.max(R.ZERO, R.subtract(capacity, others));
  return R.divide(remainder, R.rational(Math.max(1, wholeBarCount)));
}

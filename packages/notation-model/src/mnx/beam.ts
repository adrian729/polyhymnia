import * as R from './rational.js';
import type { Rational } from './rational.js';
import { beatGroupingFor, microGrouping, type GroupingOptions, type Meter } from './meter.js';
import type { NoteValueBase } from './types.js';

const of = R.rational;

const BEAMABLE_BASES = new Set<NoteValueBase>(['eighth', '16th', '32nd', '64th']);

export interface BeamOptions extends GroupingOptions {}

export interface BeamableEvent {
  readonly id: string;
  readonly kind: 'note' | 'chord' | 'rest' | 'space';
  readonly base?: NoteValueBase;
  readonly dots: number;
  readonly length: Rational;
  readonly tupletId?: string;
}

export function beamGroups(
  meter: Meter,
  events: readonly BeamableEvent[],
  options?: GroupingOptions,
  pickupOffset?: Rational,
): readonly (readonly string[])[] {
  const boundaries = effectiveBoundaries(meter, options, events, pickupOffset ?? R.ZERO);

  const runs: BeamableEvent[][] = [];
  let current: BeamableEvent[] = [];
  let pos = pickupOffset ?? R.ZERO;
  let prevOnset: Rational | null = null;
  let lastTupletId: string | undefined;

  const flush = (): void => {
    if (current.length > 0) runs.push(current);
    current = [];
  };

  for (const ev of events) {
    const onset = pos;
    pos = R.add(pos, ev.length);
    const beamable = (ev.kind === 'note' || ev.kind === 'chord') && ev.base !== undefined && BEAMABLE_BASES.has(ev.base);
    if (!beamable) {
      flush();
      prevOnset = null;
      lastTupletId = undefined;
      continue;
    }
    const tupletChanged = ev.tupletId !== lastTupletId;
    const crossesBoundary =
      ev.tupletId === undefined &&
      prevOnset !== null &&
      boundaries.some((b) => R.compare(prevOnset!, b) < 0 && R.compare(onset, b) >= 0);
    if (tupletChanged || crossesBoundary) flush();
    current.push(ev);
    prevOnset = onset;
    lastTupletId = ev.tupletId;
  }
  flush();

  return runs.filter((run) => run.length >= 2).map((run) => run.map((e) => e.id));
}

function isPlainEighth(e: BeamableEvent): boolean {
  return e.tupletId !== undefined || e.kind === 'rest' || e.kind === 'space' || (e.base === 'eighth' && e.dots === 0);
}

function effectiveBoundaries(
  meter: Meter,
  options: GroupingOptions | undefined,
  events: readonly BeamableEvent[],
  pickupOffset: Rational,
): readonly Rational[] {
  const microBoundaries = cumulativePositions(microGrouping(meter));
  const mergedBoundaries = cumulativePositions(beatGroupingFor(meter, options).sizes);

  let onset = pickupOffset;
  const onsets = events.map((event) => {
    const at = onset;
    onset = R.add(onset, event.length);
    return { at, event };
  });

  const result: Rational[] = [];
  let spanStart = R.ZERO;
  for (const end of mergedBoundaries) {
    const inSpan = onsets.filter(({ at }) => R.compare(at, spanStart) >= 0 && R.compare(at, end) < 0);
    const eligible = inSpan.every(({ event }) => isPlainEighth(event));
    if (eligible) {
      result.push(end);
    } else {
      for (const b of microBoundaries) {
        if (R.compare(b, spanStart) > 0 && R.compare(b, end) <= 0) result.push(b);
      }
    }
    spanStart = end;
  }
  return result;
}

function cumulativePositions(sizes: readonly number[]): readonly Rational[] {
  const out: Rational[] = [];
  let sum = R.ZERO;
  for (const size of sizes) {
    sum = R.add(sum, of(size, 8));
    out.push(sum);
  }
  return out;
}

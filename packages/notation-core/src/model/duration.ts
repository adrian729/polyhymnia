// Duration <-> exact length conversion. `Duration` is what gets drawn; ticks are what
// gets scheduled. The two diverge in exactly one place — a `wholeBar` rest — and that
// override lives in the temporal stage, not here (data-model.md).

import * as R from './rational.js';
import type { Rational } from './rational.js';
import type { Duration, DurationBase, TupletRef, VoiceElement } from './types.js';

/** Length of each base in whole notes. */
const BASE_WHOLE_NOTES: Record<DurationBase, Rational> = {
  breve: { n: 2, d: 1 },
  whole: { n: 1, d: 1 },
  half: { n: 1, d: 2 },
  quarter: { n: 1, d: 4 },
  eighth: { n: 1, d: 8 },
  '16th': { n: 1, d: 16 },
  '32nd': { n: 1, d: 32 },
  '64th': { n: 1, d: 64 },
};

export const DURATION_BASES: readonly DurationBase[] = [
  'breve',
  'whole',
  'half',
  'quarter',
  'eighth',
  '16th',
  '32nd',
  '64th',
];

/** Each dot adds half the previous increment: 1 dot = 3/2, 2 dots = 7/4. */
const DOT_FACTOR: readonly Rational[] = [
  { n: 1, d: 1 },
  { n: 3, d: 2 },
  { n: 7, d: 4 },
];

export function baseLength(base: DurationBase): Rational {
  const length = BASE_WHOLE_NOTES[base];
  if (!length) throw new RangeError(`Unknown duration base: ${String(base)}`);
  return length;
}

/** A tuplet plays `actual` notes in the time of `normal`, so each is scaled by
 *  normal/actual — a 3:2 eighth is 2/3 of an eighth. */
export function tupletFactor(tuplet: TupletRef | undefined): Rational {
  if (!tuplet) return R.ONE;
  if (!Number.isFinite(tuplet.actual) || tuplet.actual <= 0) return R.ONE;
  if (!Number.isFinite(tuplet.normal) || tuplet.normal <= 0) return R.ONE;
  return R.rational(Math.round(tuplet.normal), Math.round(tuplet.actual));
}

/** Exact length in whole notes. */
export function durationToRational(duration: Duration): Rational {
  const dots = clampDots(duration.dots);
  const withDots = R.multiply(baseLength(duration.base), DOT_FACTOR[dots]!);
  return R.multiply(withDots, tupletFactor(duration.tuplet));
}

/** Integer ticks at the API boundary. */
export function durationToTicks(duration: Duration, divisions: number): number {
  return R.toTicks(durationToRational(duration), divisions);
}

export function ticksToRational(ticks: number, divisions: number): Rational {
  return R.fromTicks(ticks, divisions);
}

/** Measure capacity in whole notes: `beats / beatType`. 9/8 = 9/8 of a whole note,
 *  which no `{base, dots<=2}` can express — hence `RestEl.wholeBar` (data-model.md). */
export function timeCapacity(beats: number, beatType: number): Rational {
  if (!Number.isFinite(beats) || beats <= 0) throw new RangeError(`Bad beats: ${beats}`);
  if (!Number.isFinite(beatType) || beatType <= 0) {
    throw new RangeError(`Bad beatType: ${beatType}`);
  }
  return R.rational(Math.round(beats), Math.round(beatType));
}

function clampDots(dots: number | undefined): 0 | 1 | 2 {
  if (dots === 1) return 1;
  if (dots === 2) return 2;
  return 0;
}

// --- notatable-duration decomposition ---------------------------------------

interface Candidate {
  duration: Duration;
  length: Rational;
}

/** Every notatable {base, dots<=2} shape, longest first. Built once. */
const CANDIDATES: readonly Candidate[] = DURATION_BASES.flatMap((base) =>
  ([0, 1, 2] as const).map((dots) => ({
    duration: { base, dots } as Duration,
    length: R.multiply(baseLength(base), DOT_FACTOR[dots]!),
  })),
).sort((a, b) => R.compare(b.length, a.length));

const SHORTEST = CANDIDATES[CANDIDATES.length - 1]!.length;

/**
 * Decompose a length into the fewest notatable durations. Greedy: the largest
 * {base, dots<=2} shape that fits, recurse on the remainder (interaction.md's
 * `fillRests`). Terminates for any positive length.
 *
 * A residue shorter than a 64th cannot arise from any notatable content and is
 * dropped rather than rounded up: it can only come from tick input that isn't
 * representable at this `divisions`, and overshooting would turn a sub-64th of noise
 * into a spurious `measure-overfull`.
 */
export function decomposeLength(length: Rational): Duration[] {
  const out: Duration[] = [];
  let remaining = length;
  // Guard against a pathological input producing an unbounded list; the real bound is
  // ~3 shapes per octave of duration, so 64 is unreachable by any musical value.
  for (let guard = 0; guard < 64; guard += 1) {
    if (R.compare(remaining, SHORTEST) < 0) break;
    const pick = CANDIDATES.find((c) => R.compare(c.length, remaining) <= 0);
    if (!pick) break;
    out.push({ ...pick.duration });
    remaining = R.subtract(remaining, pick.length);
    if (R.isZero(remaining)) break;
  }
  return out;
}

/** Tick-denominated wrapper over `decomposeLength`. */
export function decomposeTicks(ticks: number, divisions: number): Duration[] {
  if (!Number.isFinite(ticks) || ticks <= 0) return [];
  return decomposeLength(R.fromTicks(ticks, divisions));
}

/** True when a length is expressible as a single {base, dots<=2} shape — false for
 *  9/8, 5/4, 11/8 capacities, which is why `wholeBar` rests exist. */
export function isNotatable(length: Rational): boolean {
  return CANDIDATES.some((c) => R.equals(c.length, length));
}

// --- element lengths --------------------------------------------------------

export function isWholeBarRest(el: VoiceElement): boolean {
  return el.kind === 'rest' && el.wholeBar === true;
}

/**
 * Length of every element in a voice, in whole notes.
 *
 * A `wholeBar` rest is the one element whose length is not derived from its own
 * `Duration` (pinned to 'whole' for rendering regardless of meter): it takes whatever
 * capacity the other elements leave, which for the normal case of a bar containing
 * nothing else is the full measure. Several `wholeBar` rests in one voice is not
 * meaningful notation; they split the remainder so the voice still sums to capacity.
 */
export function elementLengths(
  elements: readonly VoiceElement[],
  capacity: Rational,
): Rational[] {
  const wholeBarCount = elements.reduce((n, el) => n + (isWholeBarRest(el) ? 1 : 0), 0);
  if (wholeBarCount === 0) return elements.map((el) => durationToRational(el.duration));

  const others = elements.reduce(
    (sum, el) => (isWholeBarRest(el) ? sum : R.add(sum, durationToRational(el.duration))),
    R.ZERO,
  );
  const remainder = R.max(R.ZERO, R.subtract(capacity, others));
  const each = R.divide(remainder, R.rational(wholeBarCount));
  return elements.map((el) =>
    isWholeBarRest(el) ? each : durationToRational(el.duration),
  );
}

/** Total length of a voice, in whole notes. */
export function voiceLength(
  elements: readonly VoiceElement[],
  capacity: Rational,
): Rational {
  return elementLengths(elements, capacity).reduce((sum, l) => R.add(sum, l), R.ZERO);
}

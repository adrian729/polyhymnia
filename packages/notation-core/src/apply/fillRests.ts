// interaction.md's rest-filling primitive. Lives in `apply/` because `spliceVoice` is
// its only real caller — every edit that shortens a voice re-pads with it so the
// measure's total duration never changes.

import { decomposeTicks } from '../model/duration.js';
import { asNoteId, createId } from '../model/ids.js';
import type { RestEl } from '../model/types.js';

/**
 * Decompose a tick length into the fewest notatable rest durations. Rests aren't tied
 * (unlike notes), so the result is a sequence of independent rest glyphs rather than
 * one. Greedy: the largest {base, dots<=2} shape that fits, recurse on the remainder.
 * Terminates for any positive tick count.
 *
 * Never emits `wholeBar: true` — that mechanism is `spliceVoice`'s job when a remainder
 * reconsumes a measure's full capacity, and the two must not overlap.
 */
export function fillRests(ticks: number, divisions: number): RestEl[] {
  return decomposeTicks(ticks, divisions).map((duration) => ({
    kind: 'rest' as const,
    id: asNoteId(createId('r')),
    duration,
  }));
}

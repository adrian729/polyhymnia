// Pipeline stage 4 — grouping (architecture.md), tuplet spans only.
//
// Deliberately minimal: beat grouping and beam groups belong to the beaming stage
// (stage 9), which is not implemented yet, and its 3-tier `beatGrouping` resolution
// order (engraving.md) resolves there rather than here. What this stage does produce is
// the tuplet span shape engraving.md specifies, so the beaming stage — which decides
// bracket suppression from whether a span beams as one run — has something to read.

import type { NotationOptions } from '../model/options.js';
import type { Diagnostic, NoteId } from '../model/types.js';
import type { TemporalElement, TemporalScore } from './temporal.js';

/** engraving.md "## Tuplets". `bracket` is provisional: the beaming stage suppresses it
 *  when every element in the span beams together as one run. */
export interface TupletSpan {
  id: string;
  startTick: number;
  endTick: number;
  actual: number;
  normal: number;
  elements: readonly NoteId[];
  bracket: boolean;
  staffIndex: number;
  measureIndex: number;
  voice: 0 | 1;
}

export interface GroupingScore {
  tuplets: readonly TupletSpan[];
  diagnostics: readonly Diagnostic[];
}

export function grouping(score: TemporalScore, _options?: NotationOptions): GroupingScore {
  const spans = new Map<string, TupletSpan>();
  const ordered = [...score.elements].sort(
    (a, b) => a.staffIndex - b.staffIndex || a.voice - b.voice || a.tick - b.tick,
  );

  for (const el of ordered) {
    const ref = el.element.duration.tuplet;
    if (!ref) continue;
    // A span is per voice and per measure — `temporal` already rejects one that crosses
    // a barline, so the key only has to keep two voices' identically-named runs apart.
    const key = `${el.staffIndex}:${el.measureIndex}:${el.voice}:${ref.id}`;
    const existing = spans.get(key);
    if (!existing) {
      spans.set(key, {
        id: ref.id,
        startTick: el.tick,
        endTick: el.tick + el.durationTicks,
        actual: ref.actual,
        normal: ref.normal,
        elements: [el.id],
        bracket: true,
        staffIndex: el.staffIndex,
        measureIndex: el.measureIndex,
        voice: el.voice,
      });
      continue;
    }
    existing.startTick = Math.min(existing.startTick, el.tick);
    existing.endTick = Math.max(existing.endTick, el.tick + el.durationTicks);
    (existing.elements as NoteId[]).push(el.id);
  }

  return { tuplets: [...spans.values()], diagnostics: [] };
}

/** Convenience for a later beaming stage: the span an element belongs to, if any. */
export function tupletOf(
  groups: GroupingScore,
  el: TemporalElement,
): TupletSpan | undefined {
  return groups.tuplets.find((span) => span.elements.includes(el.id));
}

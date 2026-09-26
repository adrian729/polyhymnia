import type { NotationOptions } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import type { NormalizedScore } from './normalize.js';
import type { NoteId, TupletDisplay } from './records.js';
import type { TemporalScore } from './temporal.js';

export interface TupletSpan {
  id: string;
  startTick: number;
  endTick: number;
  actual: number;
  normal: number;
  elements: readonly NoteId[];
  display: TupletDisplay;
  showBracket: boolean;
  staffIndex: number;
  measureIndex: number;
  voice: 0 | 1;
}

export interface GroupingScore {
  tuplets: readonly TupletSpan[];
  diagnostics: readonly Diagnostic[];
}

interface PendingSpan {
  id: string;
  startTick: number;
  endTick: number;
  actual: number;
  normal: number;
  elements: NoteId[];
  display: TupletDisplay;
  staffIndex: number;
  measureIndex: number;
  voice: 0 | 1;
  hasRest: boolean;
}

export function grouping(
  normalized: NormalizedScore,
  score: TemporalScore,
  _options?: NotationOptions,
): GroupingScore {
  const beamIdByElement = new Map<NoteId, string>();
  for (const beam of normalized.beams) {
    for (const id of beam.elements) beamIdByElement.set(id, beam.id);
  }

  const spans = new Map<string, PendingSpan>();
  const ordered = [...score.elements].sort(
    (a, b) => a.staffIndex - b.staffIndex || a.voice - b.voice || a.tick - b.tick,
  );

  for (const el of ordered) {
    const ref = el.tuplet;
    if (!ref) continue;
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
        display: ref.display ?? {},
        staffIndex: el.staffIndex,
        measureIndex: el.measureIndex,
        voice: el.voice,
        hasRest: el.kind === 'rest',
      });
      continue;
    }
    existing.startTick = Math.min(existing.startTick, el.tick);
    existing.endTick = Math.max(existing.endTick, el.tick + el.durationTicks);
    existing.elements.push(el.id);
    existing.hasRest = existing.hasRest || el.kind === 'rest';
  }

  const tuplets = [...spans.values()].map((span) => {
    const { hasRest, ...rest } = span;
    return { ...rest, showBracket: resolveBracket(span, beamIdByElement) };
  });

  return { tuplets, diagnostics: [] };
}

function resolveBracket(span: PendingSpan, beamIdByElement: ReadonlyMap<NoteId, string>): boolean {
  const setting = span.display.bracket;
  if (setting === 'yes') return true;
  if (setting === 'no') return false;
  if (span.hasRest) return true;
  let beamId: string | undefined;
  for (const id of span.elements) {
    const b = beamIdByElement.get(id);
    if (!b) return true;
    if (beamId === undefined) beamId = b;
    else if (beamId !== b) return true;
  }
  return false;
}

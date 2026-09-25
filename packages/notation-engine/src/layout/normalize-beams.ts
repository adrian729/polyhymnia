import { beamGroups, beatGroupingFor, Rational as R } from '@polyhymnia/notation-model';
import type { BeamableEvent, MnxDocument, Rational } from '@polyhymnia/notation-model';
import type { NotationOptions } from '../options.js';
import { noteValueSpecLength, type BeamSegment, type DurationBase, type NoteId, type NormalizedBeam } from './records.js';
import {
  asArray,
  asObject,
  resolveId,
  synthId,
  type NormalizedElement,
  type NormalizedEvent,
  type NormalizedMeasure,
  type NormalizedVoice,
  type Reader,
} from './normalize.js';

const BEAM_LEVEL: Partial<Record<DurationBase, number>> = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };

interface ElementLocation {
  measureIndex: number;
  voice: 0 | 1;
  index: number;
}

export function resolveBeams(
  source: MnxDocument,
  partMeasures: readonly unknown[],
  measures: readonly NormalizedMeasure[],
  reader: Reader,
  options: NotationOptions | undefined,
): NormalizedBeam[] {
  const index = new Map<string, ElementLocation>();
  measures.forEach((measure, measureIndex) => {
    measure.voices.forEach((voice) => {
      voice.events.forEach((event, i) => {
        if (event.kind === 'space') return;
        if (!index.has(event.id)) index.set(event.id, { measureIndex, voice: voice.index, index: i });
      });
    });
  });

  const useBeams = asObject(asObject(source.mnx)?.support)?.useBeams === true;
  const claimed = new Set<string>();
  const beams: NormalizedBeam[] = [];
  const warnedMeters = new Set<string>();

  measures.forEach((measure, measureIndex) => {
    const pm = asObject(partMeasures[measureIndex]);
    const rawBeams = asArray(pm?.beams);
    if (rawBeams.length > 0) {
      for (const raw of rawBeams) {
        const resolved = resolveExplicitBeam(raw, measureIndex, measure, index, claimed, reader);
        if (resolved) beams.push(resolved);
      }
      return;
    }
    if (useBeams) return;
    for (const voice of measure.voices) {
      beams.push(...autoBeamVoice(measure, voice, measureIndex, options, reader, warnedMeters));
    }
  });

  return beams;
}

function capacityCutoffIndex(
  measure: NormalizedMeasure,
  events: readonly NormalizedEvent[],
): number {
  if (measure.pickup) return events.length;
  let onset = R.ZERO;
  for (let i = 0; i < events.length; i += 1) {
    if (R.compare(onset, measure.capacity) >= 0) return i;
    onset = R.add(onset, events[i]!.length);
  }
  return events.length;
}

function invalidBeam(measureIndex: number, reader: Reader): undefined {
  reader.diagnostics.push({
    severity: 'warning',
    code: 'beam-invalid',
    message: `Measure ${measureIndex} has an explicit beam that references an unknown, cross-measure, cross-voice or non-beamable event, or fewer than two notes; it was dropped.`,
    measureIndex,
  });
  return undefined;
}

function resolveExplicitBeam(
  raw: unknown,
  measureIndex: number,
  measure: NormalizedMeasure,
  index: Map<string, ElementLocation>,
  claimed: Set<string>,
  reader: Reader,
): NormalizedBeam | undefined {
  const b = asObject(raw);
  const rawIds = asArray(b?.events).filter((v): v is string => typeof v === 'string');
  const ids = [...new Set(rawIds)];
  if (ids.length < 2) return invalidBeam(measureIndex, reader);

  const locations = ids.map((id) => index.get(id));
  if (locations.some((loc) => !loc) || ids.some((id) => claimed.has(id))) {
    return invalidBeam(measureIndex, reader);
  }
  const resolved = locations as ElementLocation[];
  const voice = resolved[0]!.voice;
  if (resolved.some((loc) => loc.measureIndex !== measureIndex || loc.voice !== voice)) {
    return invalidBeam(measureIndex, reader);
  }

  const voiceEvents = measure.voices.find((v) => v.index === voice)!.events;

  const cutoff = capacityCutoffIndex(measure, voiceEvents);
  const inRange = resolved
    .map((loc, i) => ({ id: ids[i]!, loc }))
    .filter(({ loc }) => loc.index < cutoff);
  if (inRange.length < 2) return invalidBeam(measureIndex, reader);

  const groupElements = inRange.map(({ loc }) => voiceEvents[loc.index] as NormalizedElement);
  const realNotes = groupElements.filter((el) => el.kind === 'note' || el.kind === 'chord');
  if (realNotes.length < 2) return invalidBeam(measureIndex, reader);
  const unbeamable = groupElements.some(
    (el) => (el.kind === 'note' || el.kind === 'chord') && BEAM_LEVEL[el.base] === undefined,
  );
  if (unbeamable) return invalidBeam(measureIndex, reader);

  const order = inRange
    .map(({ id, loc }) => ({ id, idx: loc.index }))
    .sort((a, b2) => a.idx - b2.idx);
  const minIdx = order[0]!.idx;
  const maxIdx = order[order.length - 1]!.idx;
  const groupIds = new Set(order.map((o) => o.id));

  const span: NoteId[] = [];
  for (let i = minIdx; i <= maxIdx; i += 1) {
    const el = voiceEvents[i];
    if (!el || el.kind === 'space') return invalidBeam(measureIndex, reader);
    if (el.kind !== 'rest' && !groupIds.has(el.id)) return invalidBeam(measureIndex, reader);
    span.push(el.id);
  }
  for (const id of span) claimed.add(id);

  const beamId = resolveId(b?.id, `${order[0]!.id}.beam`, reader, measureIndex);
  const spanElements = span.map(
    (id) => voiceEvents.find((e): e is NormalizedElement => e.kind !== 'space' && e.id === id)!,
  );
  const noteSpan = spanElements.filter((el) => el.kind !== 'rest');

  const onsetById = new Map<string, Rational>();
  {
    let acc = R.ZERO;
    for (const e of noteSpan) {
      onsetById.set(e.id, acc);
      acc = R.add(acc, noteValueSpecLength({ base: e.base, dots: e.dots }));
    }
  }

  const nested = asArray(b?.beams);
  const segments =
    nested.length > 0
      ? resolveExplicitSegments(nested, 2, groupIds, onsetById)
      : deriveSegments(spanElements);

  return { id: beamId, measureIndex, voice, elements: span, segments };
}

function resolveExplicitSegments(
  list: readonly unknown[],
  level: number,
  parentIds: ReadonlySet<string>,
  onsetById: ReadonlyMap<string, Rational>,
): BeamSegment[] {
  const segments: BeamSegment[] = [];
  const parentOrder = [...parentIds];
  for (const raw of list) {
    const b = asObject(raw);
    const unordered = asArray(b?.events).filter(
      (v): v is string => typeof v === 'string' && parentIds.has(v),
    );
    if (unordered.length === 0) continue;
    const ids = [...unordered].sort((a, c) => {
      const oa = onsetById.get(a);
      const oc = onsetById.get(c);
      if (oa === undefined || oc === undefined) return 0;
      return R.compare(oa, oc);
    });
    const first = ids[0]!;
    const last = ids[ids.length - 1]!;
    if (ids.length === 1) {
      const explicitDirection = b?.direction === 'left' || b?.direction === 'right' ? b.direction : undefined;
      const i = parentOrder.indexOf(first);
      const onset = onsetById.get(first);
      const hook =
        explicitDirection ??
        (i === 0
          ? 'right'
          : i === parentOrder.length - 1
            ? 'left'
            : onset === undefined || startsSubdivision(onset, level)
              ? 'right'
              : 'left');
      segments.push({ level, first, last, hook });
    } else {
      segments.push({ level, first, last });
    }
    const nested = asArray(b?.beams);
    if (nested.length > 0) {
      segments.push(...resolveExplicitSegments(nested, level + 1, new Set(ids), onsetById));
    }
  }
  return segments;
}

function subdivisionUnit(level: number): Rational {
  return R.of(1, 8 * 2 ** (level - 1));
}

function startsSubdivision(onset: Rational, level: number): boolean {
  const ratio = R.divide(onset, subdivisionUnit(level));
  return ratio.d !== 1 || ratio.n % 2 === 0;
}

function deriveSegments(span: readonly NormalizedElement[]): BeamSegment[] {
  const levels = span.map((e) => (e.kind === 'rest' ? -1 : (BEAM_LEVEL[e.base] ?? 0)));
  const maxLevel = Math.max(0, ...levels);
  const onsets: Rational[] = [];
  let acc = R.ZERO;
  for (const e of span) {
    onsets.push(acc);
    acc = R.add(acc, noteValueSpecLength({ base: e.base, dots: e.dots }));
  }
  const noteIndices = span.map((_, i) => i).filter((i) => levels[i]! >= 0);
  const firstNote = noteIndices[0] ?? 0;
  const lastNote = noteIndices[noteIndices.length - 1] ?? span.length - 1;

  const segments: BeamSegment[] = [];
  for (let level = 2; level <= maxLevel; level += 1) {
    let i = 0;
    while (i < span.length) {
      if (levels[i]! < level) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < span.length && levels[j + 1]! >= level) j += 1;
      if (j > i) {
        segments.push({ level, first: span[i]!.id, last: span[j]!.id });
      } else {
        const hook: BeamSegment['hook'] =
          i === firstNote
            ? 'right'
            : i === lastNote
              ? 'left'
              : startsSubdivision(onsets[i]!, level)
                ? 'right'
                : 'left';
        segments.push({ level, first: span[i]!.id, last: span[i]!.id, hook });
      }
      i = j + 1;
    }
  }
  return segments;
}

function autoBeamVoice(
  measure: NormalizedMeasure,
  voice: NormalizedVoice,
  measureIndex: number,
  options: NotationOptions | undefined,
  reader: Reader,
  warnedMeters: Set<string>,
): NormalizedBeam[] {
  const cutoff = capacityCutoffIndex(measure, voice.events);
  const clipped = voice.events.slice(0, cutoff);
  const events: BeamableEvent[] = clipped.map((e, i) =>
    e.kind === 'space'
      ? { id: `#${i}`, kind: 'space', dots: 0, length: e.length }
      : { id: e.id, kind: e.kind, base: e.base, dots: e.dots, length: e.length, tupletId: e.tuplet?.id },
  );
  const contentLength = events.reduce((sum, e) => R.add(sum, e.length), R.ZERO);
  const offset =
    measure.pickup && measureIndex === 0
      ? R.subtract(R.of(measure.time.beats, measure.time.beatType), contentLength)
      : R.ZERO;

  const grouping = beatGroupingFor(measure.time, options?.beaming);
  if (grouping.invalid) {
    const key = `${measure.time.beats}/${measure.time.beatType}`;
    if (!warnedMeters.has(key)) {
      warnedMeters.add(key);
      reader.diagnostics.push({
        severity: 'warning',
        code: 'beam-grouping-invalid',
        message: `Invalid beatGrouping for meter ${key}; using the default beat grouping.`,
      });
    }
  }

  const groups = beamGroups(measure.time, events, options?.beaming, offset);
  const byId = new Map(
    voice.events
      .filter((e): e is NormalizedElement => e.kind !== 'space')
      .map((e) => [e.id, e] as const),
  );

  return groups.map((group) => {
    const noteSpan = group.map((id) => byId.get(id)!);
    return {
      id: synthId(`${group[0]}.beam`, reader, measureIndex),
      measureIndex,
      voice: voice.index,
      elements: group,
      segments: deriveSegments(noteSpan),
    } satisfies NormalizedBeam;
  });
}

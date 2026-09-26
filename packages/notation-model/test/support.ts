import { parsePitch } from '../src/mnx/pitch.js';
import type { Event, MeasureGlobal, MnxDocument, Note, NoteValue, NoteValueBase, PartMeasure, Sequence, SequenceContent, Tuplet } from '../src/mnx/types.js';

const BASES: Record<string, NoteValueBase> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th' };

export function value(token: string): NoteValue {
  const base = BASES[token];
  if (!base) throw new Error(`bad duration token ${token}`);
  return { base };
}

export function note(pitch: string, duration: string, extra: Partial<Event> = {}, noteExtra: Partial<Note> = {}): Event {
  return { duration: value(duration), notes: [{ pitch: parsePitch(pitch), ...noteExtra }], ...extra };
}

export function chord(pitches: readonly string[], duration: string, extra: Partial<Event> = {}): Event {
  return { duration: value(duration), notes: pitches.map((p) => ({ pitch: parsePitch(p) })), ...extra };
}

export function rest(duration: string, extra: Partial<Event> = {}): Event {
  return { duration: value(duration), rest: {}, ...extra };
}

export function grace(...content: SequenceContent): SequenceContent[number] {
  return { type: 'grace', content } as SequenceContent[number];
}

export function tremolo(marks: number, outer: [number, string], ...content: Event[]): SequenceContent[number] {
  return { type: 'tremolo', marks, outer: { multiple: outer[0], duration: value(outer[1]) }, content } as SequenceContent[number];
}

export function tuplet(inner: [number, string], outer: [number, string], ...content: SequenceContent): Tuplet {
  return {
    type: 'tuplet',
    inner: { multiple: inner[0], duration: value(inner[1]) },
    outer: { multiple: outer[0], duration: value(outer[1]) },
    content,
  };
}

export interface MeasureSpec {
  global?: MeasureGlobal;
  part?: Omit<PartMeasure, 'sequences'>;
  sequences: Sequence[];
}

export function measure(...content: SequenceContent): MeasureSpec {
  return { sequences: [{ content }] };
}

export function mnx(...measures: MeasureSpec[]): MnxDocument {
  return {
    mnx: { version: 1 },
    global: {
      measures: measures.map((m, i) => ({
        ...(i === 0 ? { time: { count: 4, unit: 4 } } : {}),
        ...m.global,
      })),
    },
    parts: [
      {
        measures: measures.map((m) => ({
          ...m.part,
          sequences: m.sequences,
        })),
      },
    ],
  };
}

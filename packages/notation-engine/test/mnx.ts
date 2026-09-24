import { readFileSync } from 'node:fs';
import { parsePitch } from '@polyhymnia/notation-model';
import type {
  Clef,
  Event,
  MeasureGlobal,
  MnxDocument,
  Note,
  NoteValue,
  NoteValueBase,
  PartMeasure,
  Sequence,
  SequenceContent,
  Tuplet,
} from '@polyhymnia/notation-model';

export const TREBLE: Clef = { sign: 'G', staffPosition: -2 };
export const BASS: Clef = { sign: 'F', staffPosition: 2 };
export const ALTO: Clef = { sign: 'C', staffPosition: 0 };
export const TENOR: Clef = { sign: 'C', staffPosition: 2 };

const BASES: Record<string, NoteValueBase> = {
  b: 'breve',
  w: 'whole',
  h: 'half',
  q: 'quarter',
  '8': 'eighth',
  '16': '16th',
  '32': '32nd',
  '64': '64th',
};

export function value(token: string): NoteValue {
  const dots = token.length - token.replace(/\.+$/, '').length;
  const base = BASES[token.replace(/\.+$/, '')];
  if (!base) throw new Error(`bad duration token ${token}`);
  return dots > 0 ? { base, dots } : { base };
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

export function voices(...sequences: SequenceContent[]): MeasureSpec {
  return { sequences: sequences.map((content) => ({ content })) };
}

export function withGlobal(global: MeasureGlobal, spec: MeasureSpec): MeasureSpec {
  return { ...spec, global: { ...spec.global, ...global } };
}

export function withPart(part: Omit<PartMeasure, 'sequences'>, spec: MeasureSpec): MeasureSpec {
  return { ...spec, part: { ...spec.part, ...part } };
}

export interface ScoreStart {
  clef?: Clef;
  key?: number;
  time?: MeasureGlobal['time'];
}

export function mnx(start: ScoreStart, ...measures: MeasureSpec[]): MnxDocument {
  return {
    mnx: { version: 1 },
    global: {
      measures: measures.map((m, i) => ({
        ...(i === 0 ? { time: start.time ?? { count: 4, unit: 4 } } : {}),
        ...(i === 0 && start.key !== undefined ? { key: { fifths: start.key } } : {}),
        ...m.global,
      })),
    },
    parts: [
      {
        measures: measures.map((m, i) => ({
          ...(i === 0 ? { clefs: [{ clef: start.clef ?? TREBLE }] } : {}),
          ...m.part,
          sequences: m.sequences,
        })),
      },
    ],
  };
}

export function fixture(name: string): MnxDocument {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as MnxDocument;
}

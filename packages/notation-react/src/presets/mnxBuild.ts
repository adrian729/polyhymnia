import { parsePitch } from '@polyhymnia/notation-model';
import type { Clef, Event, MnxDocument, NoteValue, Pitch, Time } from '@polyhymnia/notation-model';
import type { ClefSpec } from '@polyhymnia/notation-engine';

const CLEFS: Record<ClefSpec['kind'], Clef> = {
  treble: { sign: 'G', staffPosition: -2 },
  bass: { sign: 'F', staffPosition: 2 },
  alto: { sign: 'C', staffPosition: 0 },
  tenor: { sign: 'C', staffPosition: 2 },
};

export function noteEvent(pitch: string, duration: NoteValue): Event {
  return { duration, notes: [{ pitch: parsePitch(pitch) }] };
}

export function noteEventFromPitch(pitch: Pitch, duration: NoteValue): Event {
  return { duration, notes: [{ pitch }] };
}

export function chordEvent(pitches: readonly string[], duration: NoteValue): Event {
  return { duration, notes: pitches.map((p) => ({ pitch: parsePitch(p) })) };
}

export function buildMeasureScore(
  clef: ClefSpec['kind'],
  time: Time,
  events: readonly Event[],
  fifths?: number,
): MnxDocument {
  return {
    mnx: { version: 1 },
    global: {
      measures: [{ time, ...(fifths !== undefined ? { key: { fifths } } : {}) }],
    },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: CLEFS[clef] }],
            sequences: [{ content: [...events] }],
          },
        ],
      },
    ],
  };
}

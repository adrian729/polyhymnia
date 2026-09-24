// Element identity. Never derived from array position — interaction names elements by
// ID, playback's `activeIds` must survive re-layout, and React keys on `id`
// (data-model.md "Identity").

import type { MeasureId, NoteId, SlurId, VoiceId } from './types.js';

let counter = 0;

/** Default auto-incrementing ID generator. A caller that needs stable IDs across runs
 *  (golden files, serialized fixtures) passes its own IDs via `opts.id` instead. */
export function createId(prefix = 'el'): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** Test/fixture hook — makes builder output deterministic across runs. */
export function resetIdCounter(value = 0): void {
  counter = value;
}

// Brand casts. The brands exist to stop a MeasureId being passed where a NoteId is
// expected; at runtime every ID is just a string.

export const asNoteId = (id: string): NoteId => id as NoteId;
export const asMeasureId = (id: string): MeasureId => id as MeasureId;
export const asVoiceId = (id: string): VoiceId => id as VoiceId;
export const asSlurId = (id: string): SlurId => id as SlurId;

export const newNoteId = (): NoteId => asNoteId(createId('n'));
export const newMeasureId = (): MeasureId => asMeasureId(createId('m'));
export const newVoiceId = (): VoiceId => asVoiceId(createId('v'));
export const newSlurId = (): SlurId => asSlurId(createId('s'));

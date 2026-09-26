import type { Diagnostic } from '../mnx/read.js';
import type { MnxDocument, Pitch } from '../mnx/types.js';
import type { NoteId } from '../mnx/element-ids.js';

export type EditIntent = { type: 'setPitches'; event: NoteId; pitches: readonly Pitch[] };

export interface ApplyResult {
  doc: MnxDocument;
  changed: readonly NoteId[];
  diagnostics: Diagnostic[];
}

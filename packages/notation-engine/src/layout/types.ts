// The render-ready output shape (architecture.md "## LayoutResult").
//
// Flat and JSON-serializable by design — it enables golden-file testing and would let
// layout move to a worker with no API change. The one exception is `timemap`, which
// playback.md specifies with methods; its data (`entries`/`measures`/`tempo`) still
// serializes, the lookup helpers do not.

import type { Diagnostic } from '@polyhymnia/notation-model';
import type { ClefSpec, KeySpec, NoteId, Pitch } from './records.js';
import type { TimeMap } from '../query/timemap.js';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One row of the score, in sp. */
export interface SystemBox {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GlyphRun {
  x: number;
  y: number;
  cp: number;
  cls: string;
  el?: NoteId;
}

export interface RectShape {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  cls: string;
  el?: NoteId;
}

export interface PathShape {
  d: string;
  cls: string;
  el?: NoteId;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One per member `NoteEl.id` for a chord, not one per `ChordEl` (architecture.md). */
export interface ElementBox {
  id: NoteId;
  kind: 'note' | 'chord' | 'rest';
  systemIndex: number;
  measureIndex: number;
  voice: 0 | 1;
  x: number;
  y: number;
  w: number;
  h: number;
  hitBox: Box;
  staffPosition: number;
  tick: number;
  durationTicks: number;
  /** "E flat 4, quarter note, measure 2" — a11y + text-alternative source. */
  label: string;
  eventId: NoteId;
  pitch?: Pitch;
}

// interaction.md's slot model. The type lives here so `LayoutResult` can name it; slots are generated in `query/slots.ts`.
export interface SlotRef {
  measureIndex: number;
  voice: 0 | 1;
  tick: number;
}

export interface Slot extends SlotRef {
  x: number;
  w: number;
  eventId: NoteId;
  elementIds: readonly NoteId[];
}

export interface MeasureBox {
  index: number;
  systemIndex: number;
  x: number;
  w: number;
  contentX: number;
  startTick: number;
  capacityTicks: number;
  clef: ClefSpec;
  key: KeySpec;
}

export interface LayoutResult {
  version: 1;
  viewBox: ViewBox;
  systems: readonly SystemBox[];
  glyphs: readonly GlyphRun[];
  rects: readonly RectShape[];
  paths: readonly PathShape[];
  elements: Readonly<Record<NoteId, ElementBox>>;
  slots: readonly Slot[];
  measures: readonly MeasureBox[];
  timemap: TimeMap;
  diagnostics: readonly Diagnostic[];
}

// The render-ready output shape (architecture.md "## LayoutResult").
//
// Flat and JSON-serializable by design — it enables golden-file testing and would let
// layout move to a worker with no API change. The one exception is `timemap`, which
// playback.md specifies with methods; its data (`entries`/`measures`/`tempo`) still
// serializes, the lookup helpers do not.

import type { Diagnostic, NoteId } from '../model/types.js';
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
}

// interaction.md's slot model. The type lives here so `LayoutResult` can name it; the
// generation algorithm is a later stage (`query/slots.ts`), so `slots` is always empty.
export interface SlotRef {
  measureIndex: number;
  voice: 0 | 1;
  tick: number;
}

export interface Slot extends SlotRef {
  x: number;
  w: number;
  occupiedBy?: NoteId;
  gridTicks: number;
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
  timemap: TimeMap;
  diagnostics: readonly Diagnostic[];
}

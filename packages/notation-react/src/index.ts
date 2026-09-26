export { Notation, describeScore, viewBoxAttr } from './Notation.js';
export type { NotationProps, NotationHandle, NotationPlaybackProps, PlaybackView } from './Notation.js';
export type { NotationInteractionProps, NotationIntent, IntentContext } from './Interaction.js';
export type { NotationMarksProps } from './Marks.js';

export { layoutScore, DEFAULT_OPTIONS, hitTest, previewShapes, midiOf } from '@polyhymnia/notation-engine';
export type {
  ClefSpec,
  ElementBox,
  GlyphRun,
  HitKind,
  HitOptions,
  HitResult,
  KeySpec,
  LayoutResult,
  MeasureBox,
  NotationOptions,
  PathShape,
  PreviewNote,
  RectShape,
  Slot,
  SlotRef,
  SystemBox,
  TempoOverride,
  TimeMap,
  TimeMapEntry,
  TimeSpec,
  ViewBox,
} from '@polyhymnia/notation-engine';

export { parsePitch, applyIntent, elementIds } from '@polyhymnia/notation-model';
export type { Diagnostic, EditIntent, ApplyResult, MnxDocument, NoteId, NoteValue, Pitch } from '@polyhymnia/notation-model';

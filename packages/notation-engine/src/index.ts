// `@polyhymnia/notation-engine` — pure TypeScript, no DOM, no React.

// --- options ---
export type { NotationOptions } from './options.js';
export { DEFAULT_OPTIONS } from './options.js';

// --- font ---
export {
  fontMetadata,
  fontName,
  fontVersion,
  engravingDefaults,
  glyphAdvanceWidth,
  glyphBBox,
  glyphAnchors,
  glyphAnchor,
  hasGlyph,
} from './font/metadata.js';
export type { EngravingDefaults, FontMetadata, GlyphBBox, GlyphAnchors, GlyphName } from './font/metadata.js';
export { GLYPH_CODEPOINT, glyphCodepoint } from './font/glyphs.js';

// --- engine records ---
export { DEFAULT_DIVISIONS, describePitch, midiOf, stepIndex } from './layout/records.js';
export type {
  AccidentalPolicy,
  Alter,
  BeamSegment,
  ClefSpec,
  Dots,
  Duration,
  DurationBase,
  KeySpec,
  NormalizedBeam,
  NoteId,
  NoteValueSpec,
  Pitch,
  StepNumber,
  TempoEvent,
  TempoMap,
  TimeSpec,
  TupletBracketSetting,
  TupletDisplay,
  TupletNumberSetting,
  TupletRef,
} from './layout/records.js';

// --- layout stages ---
export { normalize } from './layout/normalize.js';
export type {
  ElementNote,
  NormalizedElement,
  NormalizedEvent,
  NormalizedGap,
  NormalizedMeasure,
  NormalizedScore,
  NormalizedStaff,
  NormalizedVoice,
} from './layout/normalize.js';
export { temporal } from './layout/temporal.js';
export type { TemporalElement, TemporalMeasure, TemporalScore } from './layout/temporal.js';
export { accidentals } from './layout/accidentals.js';
export type { AccidentalScore, ResolvedAccidental } from './layout/accidentals.js';
export { grouping } from './layout/grouping.js';
export type { GroupingScore, TupletSpan } from './layout/grouping.js';
export { vertical, STEM_LENGTH } from './layout/vertical.js';
export type {
  VerticalElement,
  VerticalScore,
  NoteheadLayout,
  StemLayout,
  RestLayout,
  BreathLayout,
} from './layout/vertical.js';
export { horizontal } from './layout/horizontal.js';
export type { HorizontalMeasure, HorizontalScore, LayoutColumn, MeasureChrome } from './layout/horizontal.js';
export { breakSystems } from './layout/break.js';
export type { BreakScore, SystemAssignment } from './layout/break.js';
export { justify } from './layout/justify.js';
export type { JustifiedScore, JustifiedSystem } from './layout/justify.js';
export { emit } from './layout/emit.js';
export {
  staffPositionOf,
  stepIndexAt,
  topLineStep,
  clefGlyph,
  clefGlyphY,
  keyAlterations,
  keySignature,
  STAFF_HEIGHT,
  STAFF_LINES,
  MIDDLE_LINE,
} from './layout/staff.js';

// --- the pipeline entry point (architecture.md) ---
export { layoutScore } from './layout/index.js';
export type {
  Box,
  ElementBox,
  GlyphRun,
  LayoutResult,
  PathShape,
  RectShape,
  Slot,
  SlotRef,
  SystemBox,
  ViewBox,
} from './layout/types.js';

// --- query (playback.md) ---
export { buildTimeMap, DEFAULT_TEMPO_BPM } from './query/timemap.js';
export type { MeasureTime, TimeMap, TimeMapEntry } from './query/timemap.js';

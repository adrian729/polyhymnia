// `@earmaster/notation-core` — pure TypeScript, no DOM, no React.
//
// Implemented so far: the data model, the font metrics accessors, the builders, and
// pipeline stages 1-2 (normalize, temporal). Stages 3-11, query/ and apply/ land on top
// of these without changing them (architecture.md).

// --- model ---
export * from './model/types.js';
export * from './model/tokens.js';
export type { NotationOptions } from './model/options.js';
export { DEFAULT_OPTIONS } from './model/options.js';
// Namespace-only: `Rational.add`/`Rational.compare` rather than bare `add`/`compare`
// at the package root.
export { Rational, rational } from './model/rational.js';
export * from './model/duration.js';
export * from './model/pitch.js';
export * from './model/ids.js';

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

// --- layout stages ---
export { normalize } from './layout/normalize.js';
export type { NormalizedMeasure, NormalizedScore, NormalizedStaff } from './layout/normalize.js';
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

// --- apply (interaction.md; only `fillRests` exists so far) ---
export { fillRests } from './apply/fillRests.js';

// --- builders (also available at the `/build` subpath) ---
export * from './build/index.js';

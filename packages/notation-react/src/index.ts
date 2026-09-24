// `@polyhymnia/notation-react` — the React rendering layer.
//
// Re-export policy: an app depends on this package *only* (architecture.md "## Packages"),
// so everything needed to author and inspect a score is re-exported here rather than
// forcing direct dependencies on `@polyhymnia/notation-model` and
// `@polyhymnia/notation-engine`. Those packages are still the canonical source — importing
// from them directly is equally valid, and the re-exports are the same bindings, not
// wrappers.

export { Notation, describeScore, viewBoxAttr } from './Notation.js';
export type { NotationProps, NotationHandle } from './Notation.js';

// Content authoring (interface.md "## Content authoring") — the builders, the token
// parsers and their types.
export * from '@polyhymnia/notation-model/build';

// Layout: the pure entry point and the shapes a consumer of `onLayout` / `getLayout()`
// reads.
export { layoutScore, DEFAULT_OPTIONS } from '@polyhymnia/notation-engine';
export type {
  ElementBox,
  GlyphRun,
  LayoutResult,
  NotationOptions,
  PathShape,
  RectShape,
  SystemBox,
  TimeMap,
  TimeMapEntry,
  ViewBox,
} from '@polyhymnia/notation-engine';
export type {
  ClefSpec,
  Diagnostic,
  KeySpec,
  NoteId,
  Pitch,
  ScoreDoc,
  TimeSpec,
} from '@polyhymnia/notation-model';

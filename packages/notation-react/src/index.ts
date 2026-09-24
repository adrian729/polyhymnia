// `@earmaster/notation-react` — the React rendering layer.
//
// Re-export policy: an app depends on this package *only* (architecture.md "## Packages"),
// so everything needed to author and inspect a score is re-exported here rather than
// forcing a second direct dependency on `@earmaster/notation-core`. The core package is
// still the canonical source — importing from it directly is equally valid, and the
// re-exports are the same bindings, not wrappers.

export { Notation, describeScore, viewBoxAttr } from './Notation.js';
export type { NotationProps, NotationHandle } from './Notation.js';

// Content authoring (interface.md "## Content authoring") — the builders, the token
// parsers and their types.
export * from '@earmaster/notation-core/build';

// Layout: the pure entry point and the shapes a consumer of `onLayout` / `getLayout()`
// reads.
export { layoutScore, DEFAULT_OPTIONS } from '@earmaster/notation-core';
export type {
  ClefSpec,
  Diagnostic,
  ElementBox,
  GlyphRun,
  KeySpec,
  LayoutResult,
  NotationOptions,
  NoteId,
  PathShape,
  Pitch,
  RectShape,
  ScoreDoc,
  SystemBox,
  TimeMap,
  TimeMapEntry,
  TimeSpec,
  ViewBox,
} from '@earmaster/notation-core';

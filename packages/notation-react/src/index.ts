// `@polyhymnia/notation-react` — the React rendering layer.
//
// Re-export policy: an app depends on this package *only* (architecture.md "## Packages"),
// so everything needed to author and inspect a score is re-exported here rather than
// forcing direct dependencies on `@polyhymnia/notation-model` and
// `@polyhymnia/notation-engine`. Those packages are still the canonical source — importing
// from them directly is equally valid, and the re-exports are the same bindings, not
// wrappers.

export { Notation, describeScore, viewBoxAttr } from './Notation.js';
export type { NotationProps, NotationHandle, NotationPlaybackProps, PlaybackView } from './Notation.js';

// Layout: the pure entry point and the shapes a consumer of `onLayout` / `getLayout()`
// reads.
export { layoutScore, DEFAULT_OPTIONS } from '@polyhymnia/notation-engine';
export type {
  ClefSpec,
  ElementBox,
  GlyphRun,
  KeySpec,
  LayoutResult,
  NotationOptions,
  PathShape,
  RectShape,
  SystemBox,
  TimeMap,
  TimeMapEntry,
  TimeSpec,
  ViewBox,
} from '@polyhymnia/notation-engine';

// The score format (AGENTS.md "Score format" — MNX only). `parsePitch` is the one
// piece of content authoring apps genuinely need: pitch props stay `'C4'` strings.
export { parsePitch } from '@polyhymnia/notation-model';
export type { Diagnostic, MnxDocument, NoteValue, Pitch } from '@polyhymnia/notation-model';

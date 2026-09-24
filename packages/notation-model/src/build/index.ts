// `@polyhymnia/notation-model/build` — the content-authoring surface (interface.md).

export { note, rest, wholeBarRest, chord, voice, tuplet } from './note.js';
export type { NoteOpts, RestOpts } from './note.js';

export { score, measure, buildDiagnostics, BuildError, DEFAULT_TIME } from './score.js';
export type { ScoreConfig, MeasureConfig, MeasureContent } from './score.js';

export { parsePitch, formatPitch, isPitchToken } from './pitch-tokens.js';
export { parseDuration, formatDuration, isDurationToken } from './duration-tokens.js';

export { createId, resetIdCounter } from '../model/ids.js';
export type { DurationToken, PitchToken } from '../model/tokens.js';

// Core notation data model — the component's own representation (data-model.md).
// No ABC, no MusicXML, no engine DSL: a second renderer or an export format is an
// adapter at the edge, not a restructuring.

// --- identity ---------------------------------------------------------------

export type NoteId = string & { readonly __brand: 'NoteId' };
export type MeasureId = string & { readonly __brand: 'MeasureId' };
export type VoiceId = string & { readonly __brand: 'VoiceId' };
export type SlurId = string & { readonly __brand: 'SlurId' };

// --- pitch ------------------------------------------------------------------

/** step/alter/octave, never MIDI — `alter` never affects y position (architecture.md). */
export interface Pitch {
  step: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0..6 = C D E F G A B
  alter: -2 | -1 | 0 | 1 | 2;
  octave: number;
}

// --- duration ---------------------------------------------------------------

export type DurationBase =
  | 'breve'
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | '16th'
  | '32nd'
  | '64th';

/** 3:2 => actual 3, normal 2. */
export interface TupletRef {
  id: string;
  actual: number;
  normal: number;
}

export interface Duration {
  base: DurationBase;
  dots: 0 | 1 | 2;
  tuplet?: TupletRef;
}

// --- elements ---------------------------------------------------------------

// A Voice is a flat, ordered, sequential list. No onset/tick field: onset is ALWAYS
// derived by summing preceding durations in the array (data-model.md "Time").
export type VoiceElement = NoteEl | ChordEl | RestEl;

/** Written-accidental resolution policy (engraving.md). */
export type AccidentalPolicy = 'auto' | 'always' | 'never' | 'cautionary';

export interface NoteEl {
  kind: 'note';
  id: NoteId;
  pitch: Pitch;
  duration: Duration;
  tie?: 'start' | 'stop' | 'continue';
  accidental?: AccidentalPolicy; // default 'auto'
  beam?: 'auto' | 'begin' | 'continue' | 'end' | 'none'; // default 'auto'
  stem?: 'auto' | 'up' | 'down' | 'none';
  slurs?: readonly { id: SlurId; role: 'start' | 'stop' }[];
  meta?: Readonly<Record<string, unknown>>; // opaque passthrough, renderer ignores
}

export interface ChordEl {
  kind: 'chord';
  id: NoteId;
  notes: readonly NoteEl[];
  duration: Duration;
}

export interface RestEl {
  kind: 'rest';
  id: NoteId;
  duration: Duration;
  staffPosition?: number;
  /** Draws one whole-rest glyph and takes the measure's full capacity in ticks (data-model.md). */
  wholeBar?: boolean;
}

// --- structure --------------------------------------------------------------

export interface Measure {
  id: MeasureId;
  clef?: ClefSpec;
  key?: KeySpec;
  time?: TimeSpec; // absent = inherit from previous measure
  voices: readonly Voice[]; // length 1 or 2
  barlineEnd?: 'single' | 'double' | 'final' | 'repeat-end' | 'none';
  barlineStart?: 'none' | 'repeat-start';
  pickup?: boolean; // anacrusis — exempt from the fullness rule
  systemBreak?: boolean; // force a system (line) break after this measure
}

export interface Voice {
  id: VoiceId;
  index: 0 | 1;
  elements: readonly VoiceElement[];
}

export interface ClefSpec {
  kind: 'treble' | 'bass' | 'alto' | 'tenor';
  octaveShift?: -1 | 0 | 1;
}

export interface KeySpec {
  fifths: -7 | -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  mode?: 'major' | 'minor';
}

export interface TimeSpec {
  beats: number;
  beatType: number;
  symbol?: 'normal' | 'common' | 'cut';
  /** Irregular meters (5/8, 7/8): per-measure override, highest priority in the
   *  3-tier resolution order (engraving.md). */
  beatGrouping?: readonly number[];
}

export interface Staff {
  id: string;
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  measures: readonly Measure[];
}

export interface ScoreDoc {
  id: string;
  divisions: number; // ticks per quarter, default 3360
  staves: readonly Staff[]; // length 1 today; array so grand staff needs no type change
  tempo: TempoMap; // tempo is notation data, not audio data (playback.md)
}

// --- tempo (playback.md) ----------------------------------------------------

export interface TempoEvent {
  tick: number;
  bpm: number;
  beatUnit?: DurationBase; // default 'quarter'
}

/** Piecewise-constant; ramps deferred. */
export type TempoMap = readonly TempoEvent[];

// --- diagnostics ------------------------------------------------------------

/** Shared by every non-throwing degrade path (normalize/temporal stages, builders,
 *  applyIntent). One type, not a per-producer shape. */
export interface Diagnostic {
  severity: 'warning' | 'error';
  code: string; // e.g. 'measure-overfull', 'splice-crosses-note'
  message: string;
  measureIndex?: number;
  voice?: 0 | 1;
  tick?: number;
}

/** Default ticks per quarter: 2^5 x 3 x 5 x 7 — divides evenly down to a 64th crossed
 *  with triplets/quintuplets/septuplets (data-model.md "Time"). */
export const DEFAULT_DIVISIONS = 3360;

/** Meter assumed when none is given, and the fallback for an unreadable one. */
export const DEFAULT_TIME: TimeSpec = { beats: 4, beatType: 4 };

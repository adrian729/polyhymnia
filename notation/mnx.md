# Data model

The component owns its own representation — no ABC, no MusicXML, no layout-engine DSL in the model. A second renderer, or a MusicXML/MIDI export, is an adapter at the edge, not a restructuring.

## Types

```ts
// identity
type NoteId    = string & { readonly __brand: 'NoteId' };
type MeasureId = string & { readonly __brand: 'MeasureId' };
type VoiceId   = string & { readonly __brand: 'VoiceId' };
type SlurId    = string & { readonly __brand: 'SlurId' };

// pitch — step/alter/octave, never MIDI (alter never affects y position, architecture.md)
interface Pitch { step: 0|1|2|3|4|5|6; alter: -2|-1|0|1|2; octave: number }   // 0..6 = C D E F G A B

// duration
type DurationBase = 'breve'|'whole'|'half'|'quarter'|'eighth'|'16th'|'32nd'|'64th';
interface TupletRef { id: string; actual: number; normal: number }            // 3:2 => actual 3, normal 2
interface Duration { base: DurationBase; dots: 0|1|2; tuplet?: TupletRef }

// elements — a Voice is a flat, ordered, sequential list. No onset/tick field: onset is
// ALWAYS derived by summing preceding durations in the array. See "Time" below.
type VoiceElement = NoteEl | ChordEl | RestEl;

type AccidentalPolicy = 'auto' | 'always' | 'never' | 'cautionary';   // written-accidental resolution, engraving.md

interface NoteEl {
  kind: 'note'; id: NoteId; pitch: Pitch; duration: Duration;
  tie?: 'start' | 'stop' | 'continue';
  accidental?: AccidentalPolicy;    // default 'auto'
  beam?: 'auto' | 'begin' | 'continue' | 'end' | 'none';       // default 'auto'
  stem?: 'auto' | 'up' | 'down' | 'none';
  slurs?: readonly { id: SlurId; role: 'start' | 'stop' }[];
  breath?: 'comma' | 'caesura';     // breathing point after this note — engraving.md; consumes no time
  meta?: Readonly<Record<string, unknown>>;                     // opaque passthrough, renderer ignores
}
interface ChordEl { kind: 'chord'; id: NoteId; notes: readonly NoteEl[]; duration: Duration }
interface RestEl  { kind: 'rest';  id: NoteId; duration: Duration; staffPosition?: number; wholeBar?: boolean }

// structure
interface Measure {
  id: MeasureId;
  clef?: ClefSpec; key?: KeySpec; time?: TimeSpec;     // absent = inherit from previous measure
  voices: readonly Voice[];                             // length 1 or 2
  barlineEnd?: 'single'|'double'|'dashed'|'final'|'repeat-end'|'none';
  barlineStart?: 'none'|'repeat-start';
  pickup?: boolean;      // anacrusis — see "Pickup measures" below; exempt from the fullness rule
  systemBreak?: boolean; // force a system (line) break after this measure — engraving.md
}
interface Voice { id: VoiceId; index: 0 | 1; elements: readonly VoiceElement[] }

interface ClefSpec { kind: 'treble'|'bass'|'alto'|'tenor'; octaveShift?: -1|0|1 }
interface KeySpec  { fifths: -7|-6|-5|-4|-3|-2|-1|0|1|2|3|4|5|6|7; mode?: 'major'|'minor' }
interface TimeSpec {
  beats: number; beatType: number; symbol?: 'normal'|'common'|'cut';
  beatGrouping?: readonly number[];    // irregular meters (5/8, 7/8): per-measure override, highest
                                        // priority in the 3-tier resolution order — engraving.md
}

interface Staff { id: string; clef: ClefSpec; key: KeySpec; time: TimeSpec; measures: readonly Measure[] }
interface ScoreDoc {
  id: string;
  divisions: number;              // ticks per quarter, default 3360 — see "Time" below
  staves: readonly Staff[];       // length 1 today; array so grand staff (README deferred list) needs no type change
  tempo: TempoMap;                // playback.md — tempo is notation data, not audio data
}

// diagnostics — shared by every non-throwing degrade path (normalize/temporal stages, builders,
// applyIntent). One type, not a per-producer shape.
interface Diagnostic {
  severity: 'warning' | 'error';
  code: string;                    // e.g. 'measure-overfull', 'splice-crosses-note', 'tuplet-crosses-barline'
  message: string;
  measureIndex?: number; voice?: 0 | 1; tick?: number;
}
```

## Time: rationals internally, integer ticks at the boundary

- Inside the temporal layout pass: `Rational { n: number; d: number }`, gcd-normalized. Exact arithmetic, no float epsilon bugs (`3 × triplet-eighth = 1 quarter` exactly).
- At every API boundary (timemap, intents, props, JSON): integer ticks. `divisions = 3360` ticks/quarter by default — `2⁵×3×5×7`, divides evenly down to a 64th (needs 2⁴) crossed with triplets/quintuplets/septuplets. Conventional 768/960 cannot represent a 64th-note septuplet exactly.
- `divisions` is configurable if MIDI/MusicXML interop is preferred over exact tuplet division — see `roadmap.md` open questions.

## Sequential positioning and the fullness rule

A voice's elements play strictly in order — no stored onset, onset is always the sum of preceding durations in that voice's array. Deliberate: a stored onset that disagrees with the durations around it becomes structurally impossible.

Consequence: **every tick of a measure must be covered by a note or a rest — no implicit gaps.** `Σ element durations == measure capacity` for every measure/voice.

- Underfull (builder or hand-built `ScoreDoc`): auto-pad a trailing rest + diagnostic.
- Overfull: truncate at the barline, drop the excess + diagnostic. Never throws — malformed content degrades visibly in a live quiz rather than crashing it.

Consequence for editing: delete/move must never shift what follows in time — `interaction.md`'s `spliceVoice`/`fillRests` is the actual algorithm. A naive `array.filter()` delete would silently shift every later onset earlier while the measure still "sums correctly" — this is the concrete failure mode the fullness rule and the splice primitive exist to rule out.

### Pickup measures

`Measure.pickup: true`: exempt from the fullness rule — `Σ element durations` may be less than the prevailing `TimeSpec`'s capacity, no auto-pad, no diagnostic. Capacity for this one measure is simply "whatever its elements sum to." Always the first measure of a score (or of a system after a `systemBreak`, if a piece pickup-repeats — out of scope, not needed for exercises). Does **not** trigger a time-signature restatement on the following measure (`engraving.md`'s Time signatures "Mid-score change" rule only fires on an actual `TimeSpec` change; a pickup measure doesn't set its own `time`, it inherits and is simply short).

### Whole-bar rests and unrepresentable capacities

`Duration` (`base` × `dots≤2`) can't represent every meter's capacity exactly — 9/8 (4.5 quarters), 5/4 (5 quarters), 11/8 (5.5 quarters) have no valid `{base,dots}` combination. `RestEl.wholeBar: true` decouples the two concerns this forces apart: `duration.base` is always `'whole'` (draws the one whole-rest glyph, the real convention regardless of meter — never a breve or a dotted shape picked to "fit"), while `durationTicks` at the `temporal` stage (`architecture.md`) is overridden to the measure's actual capacity in ticks, not derived from `base`/`dots` via the normal formula. The only place in the model a rendered duration and its tick length intentionally diverge — every other element's ticks are always derived from its own `Duration`.

## Identity

Every element's `NoteId` is caller-assigned or produced by a provided `createId()` — never derived from array position. Required by:

- Interaction: intents name elements by ID; array indices break the moment an insert happens.
- Playback: `activeIds` must survive re-layout (a resize re-runs layout and re-breaks systems).
- React reconciliation: `key={id}`; positional keys would remount every following node on an insert and kill CSS transitions on them.

`meta?: Record<string, unknown>` on `NoteEl` is an explicit opaque passthrough — the quiz layer attaches "this is the answer note" / "this is a distractor" without a parallel `Map<NoteId, QuizInfo>` to keep in sync.

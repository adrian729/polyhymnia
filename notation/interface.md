# Public API

React components a consumer imports and writes. Internals: `architecture.md`, `engraving.md`, `interaction.md`, `playback.md`.

## Root component

```ts
interface NotationProps {
  score: ScoreDoc;                    // data-model.md, required
  options?: NotationOptions;          // below, all fields default
  children?: React.ReactNode;         // compound children, below
  className?: string; style?: React.CSSProperties;
  onLayout?: (layout: LayoutResult) => void;   // architecture.md — declarative alternative to handle.getLayout()
}
```

```tsx
<Notation
  score={scoreDoc}
  options={notationOptions}
  className style
  ref={handleRef}          // NotationHandle
/>
```

Renders the `<svg>`, computes layout (`useMemo`), provides layout to compound children below. No `children` = static, non-interactive, read-only render.

## Compound children — interaction, playback

```tsx
<Notation score={doc} options={opts} ref={handleRef}>
  <Notation.Interaction mode="insert" insertDefaults={{ duration: 'q' }} onIntent={handleIntent} />
  <Notation.Playback view={{ mode: 'notes', activeIds }} />
</Notation>
```

- `Notation.Interaction` props = `NotationInteraction` (`interaction.md`). `Notation.Playback` props = `{ view: PlaybackView }` (`playback.md`).
- Render nothing themselves. `<Notation>` extracts their props via direct-child introspection (`React.Children`) — single render pass, no context round-trip. Must be direct children, same constraint as `<select><option>`.
- One of each meaningful; duplicate = last wins.
- `useNotationLayout()` exported for custom overlay components — same mechanism `Notation.Playback` uses internally.
- Compound over flat props: pay only for what's used (no interaction code in the tree for a read-only reveal); a new behavior is a new child, not a bigger prop object.

## Imperative handle

```ts
interface NotationHandle {
  getLayout(): LayoutResult;
  getTimeMap(): TimeMap;
  hitTest(p: { x: number; y: number }): HitResult | null;
  setPlaybackTick(tick: number): void;
  animateCursor(span: CursorSpan): Animation;    // CursorSpan — playback.md
  exportSVG(): string;
  focus(id: NoteId): void;
}
```

## Options

One nested typed object, not flat props. Same type on the React prop and `layoutScore(score, options)` (`architecture.md`) — one options surface, not two.

```ts
interface NotationOptions {
  spacing?: { k?: number; base?: number };                                          // engraving.md, default k=0.55 base=3.2sp
  beaming?: { halfBarBeaming?: boolean; beatGrouping?: readonly number[] };          // engraving.md, default halfBarBeaming=true; beatGrouping is a score-wide fallback, overridden per-measure by TimeSpec.beatGrouping
  accidentals?: {
    courtesyPolicy?: 'none' | 'next-measure' | 'always';                            // default 'next-measure'
    parenthesizeCautionary?: boolean;
    insertAlteration?: 'key' | 'natural';                                            // interaction.md, default 'key'
  };
  insertGrid?: DurationToken | Duration;    // default: beat subdivision implied by the meter
  tuplets?: { showRatio?: boolean };         // engraving.md, default false — numeral shows actual only
  font?: { family?: string; url?: string };
  widthSp?: number;                          // system width, engraving.md
  maxLastSystemFill?: number;                // default 0.65, engraving.md
}
```

Every field defaults; `<Notation score={doc}>` alone is valid.

## Content authoring

`score: ScoreDoc` is the only source of truth. No JSX-per-note composition (`<Note pitch="C4"/>` as a real content element) — a note can't render standalone, layout needs the whole score for spacing/beaming, so it would just be a non-rendering data-collection shim: a second implicit data model reconciling into `ScoreDoc` anyway, for no benefit. Instead: plain builder functions that construct `ScoreDoc` directly.

```ts
function score(config: ScoreConfig, ...measures: Measure[]): ScoreDoc;
function measure(...content: (VoiceElement | Voice)[]): Measure;                       // single-voice shorthand
function measure(config: MeasureConfig, ...content: (VoiceElement | Voice)[]): Measure;
function voice(index: 0 | 1, ...elements: VoiceElement[]): Voice;
function note(pitch: PitchToken | Pitch, duration: DurationToken | Duration, opts?: NoteOpts): NoteEl;
function rest(duration: DurationToken | Duration, opts?: RestOpts): RestEl;
function chord(notes: NoteEl[], duration?: DurationToken | Duration): ChordEl;          // duration inferred if notes agree
function tuplet(actual: number, normal: number, ...elements: VoiceElement[]): VoiceElement[];
```

Builder option/config shapes:

```ts
interface ScoreConfig { clef: ClefSpec['kind']; key?: KeySpec['fifths']; time?: TimeSpec }
interface MeasureConfig { clef?: ClefSpec['kind']; key?: KeySpec['fifths']; time?: TimeSpec; systemBreak?: boolean; pickup?: boolean }
interface NoteOpts { id?: NoteId; accidental?: AccidentalPolicy; tie?: 'start'|'stop'|'continue'; voice?: 0|1; breath?: 'comma'|'caesura' }
interface RestOpts { id?: NoteId; voice?: 0|1; wholeBar?: boolean }
```

Token grammars, template-literal-typed for editor autocomplete:

```ts
type PitchToken    = `${'A'|'B'|'C'|'D'|'E'|'F'|'G'}${''|'#'|'##'|'b'|'bb'}${number}`;   // "C4" "F#5" "Bb3"
type DurationToken = `${'b'|'w'|'h'|'q'|'8'|'16'|'32'|'64'}${''|'.'|'..'}`;              // "q" "q." "8.."
```

Example:

```ts
import { score, measure, note, chord } from '@earmaster/notation-core/build';

const doc = score({ clef: 'treble' },
  measure(chord([note('C4', 'q'), note('E4', 'q'), note('G4', 'q')])),
);
```

- IDs: auto-incrementing per builder call by default. `opts.id` pins one explicitly when the caller needs to reference it later (playback `activeIds`, quiz `meta` lookup).
- Builders enforce the fullness rule (`data-model.md`) before returning: underfull auto-pads a trailing rest + diagnostic, overfull is a hard build error. `measure({ pickup: true }, ...)` is exempt — no auto-pad, no diagnostic (`data-model.md`'s Pickup measures).

## Presets

`@earmaster/notation-react/presets` — separate export path, tree-shaken out if unused. Thin wrappers around `<Notation>` + builders for the single-exercise case — not a scoped feature of their own (`README.md`), just sugar over the builder API above.

```ts
interface ChordRevealProps { pitches: readonly PitchToken[]; clef: ClefSpec['kind']; duration?: DurationToken | Duration }   // default 'q'
interface IntervalRevealProps { from: PitchToken; to: PitchToken; clef: ClefSpec['kind']; mode: 'harmonic' | 'melodic'; duration?: DurationToken | Duration }   // default 'q'
type ScaleName = 'major' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor';
interface ScaleRevealProps { root: PitchToken; scale: ScaleName; clef: ClefSpec['kind']; descending?: boolean; duration?: DurationToken | Duration }   // default 'q'
```

`descending: true` with `scale: 'melodicMinor'`: uses the classical descending form (natural-minor pitches, lowered 6th/7th) — a genuinely different pitch set from the ascending form, not the same notes reversed. Every other `scale` value: `descending` reverses the same (ascending) pitch set, since only melodic minor has direction-dependent content.

```tsx
<ChordReveal pitches={['C4','E4','G4']} clef="treble" />
<IntervalReveal from="C4" to="E4" clef="treble" mode="harmonic" />
<ScaleReveal root="D4" scale="major" clef="treble" />
```

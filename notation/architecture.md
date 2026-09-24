# Architecture

## Packages

```
packages/
  notation-core/          # pure TS, zero deps, no DOM in tsconfig lib — runs in Node
    src/model/             types.ts rational.ts duration.ts pitch.ts ids.ts
    src/font/               metadata.ts engravingDefaults.ts glyphs.ts   (name -> codepoint)
    src/layout/
      normalize.ts temporal.ts accidentals.ts grouping.ts
      vertical.ts horizontal.ts break.ts justify.ts beams.ts curves.ts emit.ts
      index.ts              # layoutScore()
    src/query/               hitTest.ts slots.ts timemap.ts
    src/build/                score.ts note.ts duration-tokens.ts pitch-tokens.ts   (interface.md builders)
    src/apply/                 applyIntent.ts spliceVoice.ts fillRests.ts   (interaction.md)
    test/ + test/__golden__/
  notation-react/            # peer: react ^19
    src/  Notation.tsx  Interaction.tsx  Playback.tsx  context.ts  usePointerIntents.ts  useNotationHandle.ts  index.ts
    src/presets/               ChordReveal.tsx  IntervalReveal.tsx  ScaleReveal.tsx
    styles/notation.css        # default theme, all custom properties
  notation-font/                # build-time only, never in the runtime dep tree
    manifest.ts build.mjs dist/
apps/web/                        # imports @earmaster/notation-react only
```

Enforcement: `notation-core/tsconfig.json` excludes `"DOM"` from `lib`, has no `react` dependency. Any DOM or React reference is a compile error on the day it's written.

`notation-font` is build-time-only — the app imports `.woff2`/`metadata.json` as assets; fontTools/Python never appear in `npm install`.

Extraction to a published package later: set `name`/`version`/`repository`, write a README, `"sideEffects": false`. No code moves — the split already exists.

## Pipeline

Each stage is a pure function `(input, options: NotationOptions) => output`, individually replaceable — verified only through the full-pipeline entry point (`layoutScore()`, `roadmap.md`), never in isolation.

| # | Stage | Adds | Detail |
| --- | --- | --- | --- |
| 1 | normalize | resolved clef/key/time per measure | inherits forward; produces diagnostics, never throws |
| 2 | temporal | onset/duration ticks per element | rational arithmetic, tuplet scaling, fullness policy (`data-model.md`). **Timemap is born here.** |
| 3 | accidentals | resolved accidental per note | measure-scoped state, key seeding, tie carryover, cautionary rules — `engraving.md` |
| 4 | grouping | beam groups, tuplet spans, tie/slur pairs | meter-driven beat grouping — `engraving.md` |
| 5 | vertical | staff position, stem direction, *provisional* stem length, ledger lines | per-voice stem rules, chord shifting, accidental packing — `engraving.md`. Beamed notes' length is provisional here — stage 9 re-terminates it. |
| 6 | horizontal | column x, intrinsic widths | spring/rod model — `engraving.md` |
| 7 | break | system assignment | greedy fill to `options.widthSp` |
| 8 | justify | final x per column | distribute slack per system |
| 9 | beams | beam geometry, finalizes beamed-note stem length | runs after justify — slope depends on final x |
| 10 | curves | tie/slur paths | also post-justify |
| 11 | emit | `LayoutResult` | flatten to render-ready primitives |

## `LayoutResult`

Flat, JSON-serializable — enables golden-file testing (`roadmap.md`), and would let layout move to a worker later with no API change.

```ts
interface LayoutResult {
  version: 1;
  viewBox: { x: number; y: number; w: number; h: number };     // sp units
  systems: readonly SystemBox[];
  glyphs: readonly GlyphRun[];
  rects:  readonly RectShape[];   // staff lines, stems, beams, barlines, ledger lines, tuplet brackets
  paths:  readonly PathShape[];   // slurs, ties
  elements: Readonly<Record<NoteId, ElementBox>>;
  slots: readonly Slot[];          // interaction.md
  timemap: TimeMap;                 // playback.md
  diagnostics: readonly Diagnostic[];   // data-model.md
}
interface SystemBox { index: number; x: number; y: number; w: number; h: number }   // sp, one row of the score
interface GlyphRun { x: number; y: number; cp: number; cls: string; el?: NoteId }
interface RectShape { x: number; y: number; w: number; h: number; rot?: number; cls: string; el?: NoteId }
interface PathShape { d: string; cls: string; el?: NoteId }
interface ElementBox {
  id: NoteId; kind: 'note'|'chord'|'rest';
  systemIndex: number; measureIndex: number; voice: 0|1;
  x: number; y: number; w: number; h: number;
  hitBox: { x: number; y: number; w: number; h: number };
  staffPosition: number; tick: number; durationTicks: number;
  label: string;    // "E flat 4, quarter note" — a11y + text-alternative source
}
```

**Chords:** one `ElementBox` per member `NoteEl.id` (one per notehead), not one per `ChordEl`. All members of a chord share `x`/`tick`/`durationTicks`/`systemIndex`/`measureIndex`; each has its own `y`/`staffPosition`/`hitBox`/`label`, `kind:'chord'`. No separate chord-level box — matches the one-`<g>`-per-note accessibility rule (`interaction.md`) and keeps `modifyPitch`/`deleteElements` addressable per pitch without a second ID scheme. `HitResult.part:'notehead'` resolves to the member whose `staffPosition` is nearest the hit point.

Beams are `RectShape` with `rot` (a rotated rect approximates a beam's parallelogram; sub-pixel error at 0.5sp thickness / 0.25 slope cap — becomes a 4-point `PathShape` if it ever shows).

## Coordinate system

- Unit: staff space (`sp`) = gap between adjacent staff lines. All layout math in `sp`, no pixels in the core.
- SMuFL: 1 em = 4 sp. `<text font-size="4">` in an sp-unit viewBox renders glyphs at correct size, no magic constants.
- Zoom/print/responsive sizing = CSS problems (a single `viewBox` mapping), not layout problems.

**Pitch → y.** Step index `s = stepOf(letter) + 7×octave` (C=0..B=6). `y_sp = (topLineStep(clef) − s) × 0.5`, y increases downward, origin = top staff line. `alter` never affects `y` — why the model stores `{step, alter, octave}`, not MIDI.

| Clef | Top line | topLineStep | Glyph | Glyph y |
| --- | --- | --- | --- | --- |
| Treble | F5 | 38 | gClef E050 | G4, y=3.0 |
| Bass | A3 | 26 | fClef E062 | F3, y=1.0 |
| Alto | G4 | 32 | cClef E05C | C4, y=2.0 |
| Tenor | E4 | 30 | cClef E05C | C4, y=1.0 |

Octave clefs: swap glyph, shift `topLineStep` ±7.

Clef change: restated at the new measure, same barline-adjacent placement as a key/time change (`engraving.md`).

**Non-glyph elements** (`<rect>`/`<path>`), thickness from `engravingDefaults` (Bravura 1.482, measured — never hardcoded, loaded from the metadata JSON):

| Value | sp | Used for |
| --- | --- | --- |
| staffLineThickness | 0.13 | 5 staff lines |
| stemThickness | 0.12 | stems |
| beamThickness | 0.50 | beam bar height |
| beamSpacing | 0.25 | gap between beams → level-n offset = n×0.75 |
| legerLineThickness | 0.16 | ledger lines |
| legerLineExtension | 0.40 | ledger line overhang each side |
| thinBarlineThickness | 0.16 | single barline |
| thickBarlineThickness | 0.50 | final/repeat barline |
| barlineSeparation | 0.40 | gap in a double/final barline |
| dashedBarlineThickness | 0.16 | dashed barline |
| dashedBarlineDashLength | 0.50 | dashed barline dash segment |
| dashedBarlineGapLength | 0.25 | gap between dashed barline segments |
| tupletBracketThickness | 0.16 | tuplet bracket |
| slurEndpoint/MidpointThickness | 0.10 / 0.22 | slur variable-width path |
| tieEndpoint/MidpointThickness | 0.10 / 0.22 | tie variable-width path |
| repeatBarlineDotSeparation | 0.16 | repeat dots |

## Theming

No color in the layout engine, ever. Every node: `fill/stroke="currentColor"` + stable `data-*` attributes; CSS decides the rest.

```css
.em-notation { color: var(--em-ink, currentColor); }
.em-notation [data-em="staff-line"]      { color: var(--em-staff, #999); }
.em-notation [data-em-selected]          { color: var(--em-selected, #0969da); }
.em-notation [data-em-playing="true"]    { color: var(--em-playing, #0969da); }
.em-notation [data-em-cursor]            { fill: var(--em-cursor, #0969da); opacity: var(--em-cursor-opacity, .25); }
```

Playback indicator visual form is explicitly not decided here — see `playback.md`.

No `correct`/`incorrect` state in the default theme, deliberately: the renderer doesn't know quiz semantics (`data-model.md`'s `meta` passthrough, `interaction.md`'s `applyIntent` boundary) and has no prop that would drive it. Answer-correctness styling is the app's own overlay (its own class/wrapper keyed by `NoteId`, same ids `ElementBox`/`aria-label` already expose) — not a renderer concern, so not a renderer CSS hook.

## React layer

```tsx
export function Notation({ score, options, children, className, ...rest }: NotationProps) {
  const layout = useMemo(() => layoutScore(score, options), [score, options]);
  const { interaction, playback } = extractBehaviors(children);   // interface.md compound children
  return (
    <svg className={cx('em-notation', className)} viewBox={vb(layout.viewBox)} role="img"
         aria-label={describeScore(layout)} {...pointerHandlers(layout, interaction)}>
      <g data-em="rules">  {layout.rects .map(r => <rect key={r.cls+r.x+r.y} {...rectProps(r)} />)}</g>
      <g data-em="curves"> {layout.paths .map(p => <path key={p.cls+p.d.length} d={p.d} />)}</g>
      <g data-em="glyphs"> {layout.glyphs.map(g => <text key={g.el ?? g.cp+':'+g.x} x={g.x} y={g.y}
                                fontSize={4} data-em-el={g.el}>{String.fromCodePoint(g.cp)}</text>)}</g>
      <PlaybackLayer layout={layout} playback={playback} />
    </svg>
  );
}
```

Constraint that holds for all future work: **nothing in `notation-react` creates, removes, or reparents a DOM node outside React's reconciler.** `layoutScore` is pure, so StrictMode double-invocation produces identical output. Contrast: every imperative engine (VexFlow/abcjs/OSMD/alphaTab) has a DOM-ownership bug class here; this component structurally doesn't. Same property makes it SSR-safe: `layoutScore` needs no DOM, no `window`, no font.

The one exception is the playback cursor's per-frame transform write — not a violation, see `playback.md` for why.

# Architecture

## Packages

```
packages/
  notation-model/          # @polyhymnia/notation-model — thin MNX layer, pure TS, zero deps, no DOM in tsconfig lib
    schema/                  mnx-schema.json  examples/<52 files>  SOURCE   (mnx.md)
    scripts/                 mnx-update.mjs  gen-mnx-types.mjs
    src/mnx/                 types.ts (generated)  read.ts  time.ts  meter.ts  pitch.ts  rational.ts  ids.ts  element-ids.ts  beam.ts  index.ts
    src/edit/                 apply.ts  cleanup.ts  types.ts  index.ts   — `applyIntent` (interaction.md)
    test/
  notation-engine/         # @polyhymnia/notation-engine — pure TS, depends on notation-model only, no DOM — runs in Node
    src/options.ts           NotationOptions, DEFAULT_OPTIONS
    src/font/                metadata.ts metadata.json glyphs.ts   (name -> codepoint)
    src/layout/
      records.ts types.ts    flat engine-internal types: Pitch, Duration/NoteValueSpec, ClefSpec, KeySpec, TimeSpec, TempoEvent...
      normalize.ts normalize-measure.ts normalize-beams.ts   the only stage that reads MnxDocument — emits NormalizedElement/NormalizedGap
      temporal.ts             onset/duration ticks — emits TemporalElement, never reads MnxDocument
      accidentals.ts grouping.ts staff.ts tuplets.ts
      vertical.ts horizontal.ts break.ts justify.ts beams.ts curves.ts emit.ts
      index.ts              # layoutScore(doc: MnxDocument, options)
    src/query/               hitTest.ts slots.ts measures.ts preview.ts timemap.ts
    assets/                   polyhymnia-notation.woff2 OFL.txt NOTICE.txt   (exported as `./assets/*`)
    test/                     fixtures/ (MNX JSON), __golden__/ (golden.test.ts snapshots), __snapshots__/, conformance.test.ts, schema.test.ts, mnx-mapping.test.ts, golden.test.ts, layout.test.ts, pipeline.test.ts, interaction.test.ts, fullness.test.ts, rational.test.ts, mnx.ts (test helper)
  notation-react/            # depends on notation-model + notation-engine; peer: react ^19
    src/  Notation.tsx  Interaction.tsx  Marks.tsx  index.ts
    src/presets/               ChordReveal.tsx  IntervalReveal.tsx  ScaleReveal.tsx  mnxBuild.ts  shared.ts  index.ts  (build MNX internally)
    styles/notation.css        # default theme, all custom properties
    styles/polyhymnia-notation.woff2   # synced from notation-font
    test/                      interaction.test.tsx notation.test.tsx
  notation-font/                # build-time only, never in the runtime dep tree
    manifest.ts build.mjs sync.mjs filter_metadata.py rename_and_compress.py NOTICE.txt dist/
apps/web/                        # imports @polyhymnia/notation-react only; demo scores under src/scores/*.mnx.json; demo exercises + Web Audio player under src/exercises/
tools/musicxml-to-mnx/           # offline content pipeline, not a runtime package — interface.md "Authoring scores"
```

Dependency direction: `notation-model` ← `notation-engine` ← `notation-react` ← `apps/web`. Each layer depends only on the layers to its left.

- `notation-model` — a thin layer over MNX, nothing else: the vendored schema and its 52 official examples, generated `MnxDocument`/`Event`/`Note`/… types, `readMnx()` (version check), `Rational`, `noteValueLength`/`tupletRatio` (MNX note-value and tuplet math), `parsePitch`, positional-id derivation (`mnx/element-ids.ts`: `elementIds`, `idAt`, `nodeOf`), and edit application (`edit/`: `applyIntent`, pure MNX → MNX, `interaction.md`). No custom score model, no builders (`AGENTS.md`). No dependencies at all besides its own devDependencies (Ajv, `json-schema-to-typescript`, both build/test-time only).
- `notation-engine` — font metrics, `midiOf` (`layout/records.ts`, re-exported by `notation-react`), the layout pipeline reading MNX directly, `query/` (timemap), plus `NotationOptions`. Its output, `LayoutResult`, is the renderer-agnostic contract: a future Vue (or any other) rendering package depends on `notation-model` + `notation-engine` exactly as `notation-react` does, and reimplements only the rendering layer.
- `notation-react` — the React rendering layer. Presets build MNX internally (`interface.md`) from small typed props (`PitchToken`, MNX note values); there is no public builder API to re-export.

Enforcement: no lint script — the package manifests and tsconfigs are the enforcement. pnpm's strict `node_modules` means a package can only import what its `package.json` declares, so `notation-model` (no runtime dependencies) cannot reach the engine (relative-path imports across packages are not blocked by pnpm; there are none, and review keeps it that way), and `notation-engine` (depends on `notation-model` only) cannot reach React. Both `tsconfig.json`s exclude `"DOM"` from `lib`, so any DOM or React reference in either is a compile error on the day it's written.

`notation-font` is build-time-only — fontTools/Python never appear in `npm install`. `build.mjs` writes to `notation-font/dist/` and then runs `sync.mjs` (also runnable alone as `node sync.mjs`), which copies byte-identical files to where the runtime packages read them: `metadata.json` → `notation-engine/src/font/`, the `.woff2` + `OFL.txt` + `NOTICE.txt` → `notation-engine/assets/`, and the `.woff2` → `notation-react/styles/`.

Extraction to published packages later: set `name`/`version`/`repository`, write a README, `"sideEffects": false`. No code moves — the three-way split already exists.

## Pipeline

Each stage is a pure function `(input, options: NotationOptions) => output`, individually replaceable — verified only through the full-pipeline entry point (`layoutScore()`, `roadmap.md`), never in isolation.

| # | Stage | Adds | Detail |
| --- | --- | --- | --- |
| 1 | normalize | resolved clef/key/time per measure | inherits forward; produces diagnostics, never throws |
| 2 | temporal | onset/duration ticks per element | rational arithmetic, tuplet scaling, fullness policy (`mnx.md`). **Timemap is born here.** |
| 3 | accidentals | resolved accidental per note | measure-scoped state, key seeding, tie carryover, cautionary rules — `engraving.md` |
| 4 | grouping | tuplet spans | tie/slur pairing and beam groups both happen in normalize (stage 1), not here — `engraving.md`; vertical (stage 5) only derives each beam group's shared stem direction from the groups normalize already built |
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
  rects:  readonly RectShape[];   // staff lines, stems, barlines, ledger lines, tuplet brackets
  paths:  readonly PathShape[];   // beams, slurs, ties
  elements: Readonly<Record<NoteId, ElementBox>>;
  slots: readonly Slot[];          // interaction.md
  measures: readonly MeasureBox[]; // interaction.md
  timemap: TimeMap;                 // playback.md
  diagnostics: readonly Diagnostic[];   // mnx.md
}
interface SystemBox { index: number; x: number; y: number; w: number; h: number }   // sp, one row of the score
interface GlyphRun { x: number; y: number; cp: number; cls: string; el?: NoteId }
interface RectShape { x: number; y: number; w: number; h: number; rot?: number; cls: string; el?: NoteId }
// `rot` is degrees, matching SVG's `rotate()` (`notation-react`'s `Notation.tsx` passes it straight
// through) — not radians. Nothing emits it today: beams (the one shape that used to need rotation)
// are a `PathShape` instead, so no stage computes an `atan(slope)` value to feed it.
interface PathShape { d: string; cls: string; el?: NoteId }
interface ElementBox {
  id: NoteId; kind: 'note'|'chord'|'rest';
  systemIndex: number; measureIndex: number; voice: 0|1;
  x: number; y: number; w: number; h: number;
  hitBox: { x: number; y: number; w: number; h: number };
  staffPosition: number; tick: number; durationTicks: number;
  label: string;    // "E flat 4, quarter note" — a11y + text-alternative source
  eventId: NoteId;   // this box's own id for a note/rest, the chord's shared id for a member notehead
}
interface MeasureBox {
  index: number; systemIndex: number;
  x: number; w: number;        // the measure's own band, chrome included
  contentX: number;             // left edge of the first column's band — interaction.md's slot bands start here
  startTick: number; capacityTicks: number;
  clef: ClefSpec; key: KeySpec;   // looked up per measure at hit-test time (interaction.md)
}
```

**Chords:** one `ElementBox` per member note id (one per notehead), not one per chord event. All members of a chord share `x`/`tick`/`durationTicks`/`systemIndex`/`measureIndex`/`eventId`; each has its own `y`/`staffPosition`/`hitBox`/`label`, `kind:'chord'`. No separate chord-level box — matches the one-`<g>`-per-note accessibility rule (`interaction.md`) and keeps `modifyPitch`/`deleteElements` addressable per pitch without a second ID scheme. `NoteId` (`layout/records.ts`) is a plain `string` — the MNX `id` when the document supplies one, else the positional id `mnx.md` documents. `HitResult.part:'notehead'` resolves to the member whose `staffPosition` is nearest the hit point.

Beams are a 4-point `PathShape` (`cls: 'beam'`, `el` = the beam's own id — `mnx.md`), not a rotated `RectShape`: an exact parallelogram whose near edge is the line every re-terminated stem in it touches (`engraving.md` "Beaming").

## Coordinate system

- Unit: staff space (`sp`) = gap between adjacent staff lines. All layout math in `sp`, no pixels in the engine.
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
.pn-notation { color: var(--pn-ink, currentColor); }
.pn-notation [data-pn="staff-line"]      { color: var(--pn-staff, #999); }
.pn-notation [data-pn-selected]          { color: var(--pn-selected, #0969da); }
.pn-notation [data-pn-playing="true"]    { color: var(--pn-playing, #0969da); }
.pn-notation [data-pn-cursor]            { fill: var(--pn-cursor, #0969da); opacity: var(--pn-cursor-opacity, .25); }
.pn-notation [data-pn="preview"]         { opacity: var(--pn-preview-opacity, .45); }
```

Playback indicator visual form is explicitly not decided here — see `playback.md`.

No `correct`/`incorrect` state in the default theme, deliberately: the renderer doesn't know quiz semantics and has no prop that would drive it. App/quiz data about a note (is it the answer, is it a distractor) lives in the app, keyed by the note's `NoteId`, never as a field on the MNX document (`AGENTS.md`). `<Notation.Marks states={{...}}>` (`interaction.md`) writes the app's own `id → string` map onto each element `<g>` as `data-pn-state={value}`, opaquely — the renderer never inspects the string, so the default theme ships no rule for it: the app supplies its own CSS keyed by the state values it invented (e.g. `[data-pn-state="correct"] { color: green }`).

## React layer

```tsx
export function Notation({ score, options, children, className, ...rest }: NotationProps) {
  const layout = useMemo(() => layoutScore(score, options), [score, options]);
  const { interaction, playback } = extractBehaviors(children);   // interface.md compound children
  return (
    <svg className={cx('pn-notation', className)} viewBox={vb(layout.viewBox)} role="img"
         aria-label={describeScore(layout)} {...pointerHandlers(layout, interaction)}>
      <g data-pn="rules">  {layout.rects .map(r => <rect key={r.cls+r.x+r.y} {...rectProps(r)} />)}</g>
      <g data-pn="curves"> {layout.paths .map(p => <path key={p.cls+p.d.length} d={p.d} />)}</g>
      <g data-pn="glyphs"> {layout.glyphs.map(g => <text key={g.el ?? g.cp+':'+g.x} x={g.x} y={g.y}
                                fontSize={4} data-pn-el={g.el}>{String.fromCodePoint(g.cp)}</text>)}</g>
      <PlaybackLayer layout={layout} playback={playback} />
    </svg>
  );
}
```

Constraint that holds for all future work: **nothing in `notation-react` creates, removes, or reparents a DOM node outside React's reconciler.** `layoutScore` is pure, so StrictMode double-invocation produces identical output. Contrast: every imperative engine (VexFlow/abcjs/OSMD/alphaTab) has a DOM-ownership bug class here; this component structurally doesn't. Same property makes it SSR-safe: `layoutScore` needs no DOM, no `window`, no font.

The one exception is the playback cursor's per-frame transform write — not a violation, see `playback.md` for why.

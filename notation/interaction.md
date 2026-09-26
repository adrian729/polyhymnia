# Interaction

Hit-testing, slots, `MeasureBox`, `<Notation.Interaction>`/`<Notation.Marks>`, and `applyIntent`'s one intent (`setPitches`) are all implemented (`query/hitTest.ts`, `query/slots.ts`, `query/preview.ts` in `notation-engine`; `Interaction.tsx`, `Marks.tsx` in `notation-react`; `edit/apply.ts` in `notation-model`). Everything under "Deferred editor features" below is design-only and out of scope until an exercise actually needs it. Written against MNX throughout, since that's the only score format there is to design against (`AGENTS.md`).

## Hit-testing

Hybrid: per-element `<g>` for existing elements (exact) + one overlay `<rect>` per system for empty space, both resolved through one engine `hitTest()` function — pure, no DOM geometry, runs in Node.

```ts
// pointer -> sp coords: the only geometry the React layer performs
const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
const { x, y } = pt.matrixTransform(svg.getScreenCTM()!.inverse());

function hitTest(layout: LayoutResult, p: {x:number;y:number}, opts?: HitOptions): HitResult | null;

type HitKind = 'element' | 'slot' | 'point';
interface HitOptions { kinds?: readonly HitKind[]; voice?: 0|1; radius?: number; insertAlteration?: 'key'|'natural' }
// kinds default: ['element', 'slot', 'point'], tried in that order. radius: sp tolerance, default 0.5.
// insertAlteration default 'key'.
type HitResult =
  | { kind:'element'; id:NoteId; part:'notehead'|'rest'; box:ElementBox; staffPosition:number; pitch:Pitch|null }
  | { kind:'slot'; slot:Slot; staffPosition:number; pitch:Pitch }
  | { kind:'point'; measureIndex:number; systemIndex:number; x:number; tick:number; staffPosition:number; pitch:Pitch };
```

`NoteId` is a plain string — the MNX id when the document supplies one, else the engine's deterministic positional id (`mnx.md`'s ID rule). `Pitch` here is MNX's pitch shape, `{ step: 'A'..'G'; alter?: number; octave: number }` (`notation-model`'s `types.ts`), the same shape `parsePitch('C#4')` produces — `hitTest` omits `alter` when it's 0.

Resolution: a system is found first from `p.y` (staff band ±4 sp, a ledger-line allowance — a point further off-staff than that misses every kind and `hitTest` returns `null`); `element` is tried against every `ElementBox` in that system regardless of measure (its own padded `hitBox`, expanded by `opts.radius`); a chord's several member boxes at the same x resolve to the member whose `staffPosition` is nearest the click. `slot`/`point` then need a `MeasureBox` found from `p.x` within that system — no matching measure means both miss. `element`'s `pitch` is `null` for a rest, otherwise the same key-relative derivation as `slot`/`point` (below) from the box's own `staffPosition`, not the note's true written accidental — `ElementBox` doesn't carry the written `Pitch`, only position.

## Slot model

Addressable insertion points, emitted by the layout pipeline's `emit` stage (only it knows column x-ranges — `architecture.md`), one slot per existing event onset per voice.

```ts
interface SlotRef { measureIndex: number; voice: 0|1; tick: number }
interface Slot extends SlotRef {
  x: number; w: number;              // horizontal band, bands tile the measure with no gaps
  eventId: NoteId;                    // the event-level id — Slot.eventId/ElementBox.eventId
  elementIds: readonly NoteId[];      // that event's ElementBox ids: one id, or one per chord member
}
```

Generation, per measure/voice: one slot per column's element at that voice (`query/slots.ts`) — no grid subdivision. A whole-bar (`fullMeasure`) rest gets one slot spanning the whole measure's content band (`MeasureBox.contentX` to the measure's right edge) instead of a column band; its `eventId` is the same id `isFullMeasureRest` checks in `notation-model`, so a dictation `setPitches` against it correctly no-ops with `intent-target-unsupported` (below) rather than editing something that isn't a real event. Non-whole-bar slots tile the measure column-to-column: each column's band runs from its own x to the next column's x (or the measure's content-right edge for the last column), so bands are contiguous with no gaps or overlaps.

`staffPosition = round(y*2)/2`. `pitch` = invert the pitch→y formula (`architecture.md`) + current key signature's alteration for that step, expressed as an MNX pitch — clicking the F line in D major yields F♯, not F♮ (`opts.insertAlteration: 'key' | 'natural'` switches this; `'natural'` always yields `alter: 0`).

## `MeasureBox` and preview

```ts
interface MeasureBox {
  index: number; systemIndex: number;
  x: number; w: number; contentX: number;
  startTick: number; capacityTicks: number;
  clef: ClefSpec; key: KeySpec;
}
```

`LayoutResult.measures` carries one `MeasureBox` per `HorizontalMeasure`, so `hitTest` and `previewShapes` can look up a measure's clef/key at call time without re-running layout. `contentX` is the first column's `xStart` (the content band's left edge, chrome excluded); an empty measure with no columns falls back to the content-right edge, giving it a zero-width band.

```ts
interface PreviewNote { measureIndex: number; x: number; pitch: Pitch; voice?: 0|1 }
function previewShapes(layout: LayoutResult, preview: PreviewNote): { glyphs: readonly GlyphRun[]; rects: readonly RectShape[] };
```

Pure, no layout re-run: looks up `preview.measureIndex`'s `MeasureBox` (clef/key) and its system (y), places one notehead glyph (`cls: 'preview-notehead'`, no `el` — not an element), ledger-line rects (`cls: 'preview-ledger'`) as needed, and an accidental glyph (`cls: 'preview-accidental'`) only when `preview.pitch`'s alteration differs from the key's alteration for that step. Used for a drag ghost or an insert-mode cursor once those land; nothing in the renderer calls it yet.

## Intents

The renderer emits only pointer intents — what an `activate`/`hover` means (play a sound, check an answer, edit the document) is entirely the app's call, never the renderer's (`AGENTS.md`):

```ts
type NotationIntent =
  | { type: 'activate'; target: HitResult }
  | { type: 'hover'; target: HitResult | null };

interface IntentContext { layout: LayoutResult; nativeEvent: MouseEvent | KeyboardEvent }

interface NotationInteractionProps {
  targets: readonly HitKind[];       // hitTest's HitKind — which kinds this child resolves against
  voice?: 0 | 1;
  onIntent?: (intent: NotationIntent, ctx: IntentContext) => void;
}
```

`<Notation.Interaction targets={['slot','element']} onIntent={...} />` is a compound child (`interface.md`), rendering nothing itself. With no `Interaction` child, or `targets: []`, `<Notation>` renders exactly what it always did — no overlay `<rect>`s, no `role="button"`/`tabIndex` on element `<g>`s, no pointer handlers doing anything.

Behavior:

- `<svg>` gets `onClick` (→ `activate` when a hit resolves) and `onPointerMove`/`onPointerLeave` (→ `hover`). The client→sp conversion (`svg.getScreenCTM().inverse()`) is the only geometry `notation-react` performs; the result feeds straight into `hitTest(layout, point, { kinds: targets, voice, insertAlteration })`.
- Hover is deduped by hit identity (element id, slot's `eventId`, or point's `(measureIndex, staffPosition)`) — a hover handler and a following preview ghost fire once per target change, not once per pixel of pointer movement; `hover: null` fires once on pointer leave.
- When `'element'` is in `targets`, every element `<g>` additionally gets `role="button"` + `tabIndex={0}`; Enter/Space on a focused one produces the same `activate` a click on that notehead would.
- One channel covers every exercise: the app turns an `activate` on a slot into `applyIntent({ type: 'setPitches', ... })` for a dictation answer, or just into a "check the answer" comparison for click-what-you-heard and error-detection exercises — the renderer doesn't know which.

The same `<activate|hover>` pair also carries every future pointer-driven feature (drag, caret entry, etc., see "Deferred editor features" below) — a richer app behavior is a new `onIntent` handler branch, not a new renderer intent type.

## Marks

`<Notation.Marks>` is the counterpart compound child for state the app wants drawn without triggering a re-layout:

```ts
interface NotationMarksProps {
  states?: Readonly<Record<NoteId, string>>;   // opaque app state → data-pn-state, architecture.md theming
  selection?: readonly NoteId[];               // → data-pn-selected
  preview?: PreviewNote | null;                 // → previewShapes, rendered as a ghost group
}
```

`states[id]` and `selection` are written imperatively onto the existing element `<g>` ref map in an effect — the same mechanism `setPlaybackTick`'s `data-pn-playing` already uses — so changing exercise state (given/locked/correct/incorrect) never re-runs `layoutScore` and never disturbs element identity. `preview` renders a `<g data-pn="preview">` from `previewShapes(layout, preview)`, React-owned nodes, removed when `preview` is `null`.

Exercise state itself — which ids are given, which is currently being asked, whether an answer was right — is app state keyed by `NoteId`, passed in through `states`/`selection` fully controlled; it never lives in MNX, in `LayoutResult`, or anywhere inside `notation-engine`/`notation-model` (`AGENTS.md`).

## Applying intents

`applyIntent` ships from `notation-model` (`@polyhymnia/notation-model`), not `notation-engine` — edits are document surgery, not layout, and the model already owns id synthesis (`mnx.md` "ID rule") that an edit has to stay consistent with. It's not wired into `<Notation>`: the quiz layer can reject an edit (wrong answer, locked measure) without fighting the renderer. It is a pure **MNX → MNX** function: everything in the document it doesn't touch passes through `===` unchanged (`AGENTS.md`).

```ts
type EditIntent = { type: 'setPitches'; event: NoteId; pitches: readonly Pitch[] };
interface ApplyResult { doc: MnxDocument; changed: readonly NoteId[]; diagnostics: Diagnostic[] };   // Diagnostic — mnx.md
function applyIntent(doc: MnxDocument, intent: EditIntent): ApplyResult;
```

`setPitches` is the only intent so far — the smallest general method that covers dictation set, re-pitch, clear, and chord answers, because rhythm never changes: the event keeps its `duration`, tuplet membership, and every other field, so no positional id anywhere else in the document shifts (`mnx.md`).

- `event` is the event-level id — a rest's id, a single note's element id, or a chord's event id — exposed as `Slot.eventId`/`ElementBox.eventId` (below), resolved via `elementIds(doc).nodeOf`.
- `pitches: []` turns the event into a rest (`rest: {}`, `notes` removed); one pitch makes it a single note; several make it a chord.
- The touched event's id is written explicitly if it was positional (materialization, so the id stays the same across the next layout). A note that keeps its old slot's explicit id keeps it across a re-pitch; a note born from a rest stays id-less if the result is a single note (its element id is then the event's own id, same as the rest it replaced); a chord materializes an id on every member that doesn't already have one, `{eventId}.n{k}`-shaped, minted against the document's used-id set so a later edit can't renumber them.
- Old note fields (`ties`, `accidentalDisplay`, …) are dropped for any note whose pitch changed. Cleanup then removes any `ties[]` entry anywhere else in the part that targets a note id that vanished or was re-pitched, and any `slurs[]` whose `target`/`startNote`/`endNote` does likewise. Beams reference events, which persist, so `beams[]` is untouched.
- Unknown id, an id belonging to a grace/tremolo child (never addressable — `mnx.md`), or a non-event id leaves `doc` as the same reference, `changed: []`, one `intent-target-missing` warning. A whole-bar (`fullMeasure`) rest's id is addressable but not a real event with a rewritable `duration`/`notes`, so it gets the same no-op result with a distinct `intent-target-unsupported` warning instead — a dictation score should give its rhythm as real rest events, not a `fullMeasure` shorthand, if it needs to be answerable. Requesting the pitches already there is a no-op the same way, with no diagnostic.
- `changed` lists the touched event's id plus every note id added or removed, so an app can drop per-id state (exercise "given"/"correct" flags, `AGENTS.md`) for ids that no longer exist.
- Structural sharing: only the path from the document root to the touched part-measure, and any other part-measure cleanup actually touched, is copied; everything else — `global`, other parts, untouched measures — is `===` the input.

There's no `inverse` and no history knowledge; undo is deferred (`undo-design.md`, Q1). A richer set of intents — inserting/deleting/moving elements, which have to renumber positional ids and repad a voice's rests to keep its total duration fixed — is future work once slot-based insertion lands (`roadmap.md`).

## Accessibility

Every note `<g>`: `aria-label={box.label}` ("E flat 4, quarter note, measure 2"), `role="img"` by default. With `'element'` in `<Notation.Interaction>`'s `targets`, that becomes `role="button"` + `tabIndex={0}`, and Enter/Space activates it (above). `<svg>` root: `aria-label` summarizing the score. Always render the answer as text alongside the notation — `ElementBox.label` exists so the app builds that text without re-deriving it.

## Deferred editor features

Recorded here so they don't leak into I2/I3 or later exercise work:

- Rhythm-changing edits: `insertNote` with rest splicing, `deleteElements` with rest replacement, `modifyDuration`, `moveElements`, grid slots (`options.insertGrid`), measure growth.
- Editor gestures: drag to change pitch, on-canvas duration palette, caret entry, `navigate`, `contextMenu`, keyboard note entry.
- Free multi-voice entry (creating a voice-1 sequence), measure/meter/key/clef edits, copy/paste.
- Undo/redo history (`undo-design.md`, Q1) and semantic inverse intents (only needed for collaboration).
- `modifyAccidental`/`AccidentalPolicy` edits beyond what `setPitches` expresses.
- A rhythm edit intent (`setRhythm` or similar). Rhythm dictation itself needs none: the app keeps its own duration list and regenerates MNX; the notation only needs to expose `point.tick` (already in `hitTest`'s `point` kind, above).

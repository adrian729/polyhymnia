# Interaction

## Hit-testing

Hybrid: per-element `<g>` for existing elements (exact) + one overlay `<rect>` per system for empty space, both resolved through one core `hitTest()` function — pure, no DOM geometry, runs in Node (entered only via the real function signature, `roadmap.md`).

Rejected: an invisible `<rect>` per (slot × staff position) — a 4-measure 16th grid with ±4 ledger positions is ≈1,700 nodes: DOM bloat, reconciliation cost, and the rects fight real elements for pointer events.

```ts
// pointer -> sp coords: the only geometry the React layer performs
const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
const { x, y } = pt.matrixTransform(svg.getScreenCTM()!.inverse());

function hitTest(layout: LayoutResult, p: {x:number;y:number}, opts?: HitOptions): HitResult | null;
interface HitOptions { voice?: 0|1; includeChrome?: boolean; radius?: number }   // radius: sp tolerance, default 0.5
type HitResult =
  | { kind:'element'; id:NoteId; part:'notehead'|'stem'|'flag'|'accidental'|'dot'|'rest'; box:ElementBox; staffPosition:number }
  | { kind:'slot'; slot:SlotRef; staffPosition:number; pitch:Pitch }
  | { kind:'chrome'; part:'clef'|'key'|'time'|'barline'; measureIndex:number };
```

## Slot model

Addressable insertion points, emitted by the layout pipeline's `emit` stage (only it knows column x-ranges — `architecture.md`).

```ts
interface SlotRef { measureIndex: number; voice: 0|1; tick: number }
interface Slot extends SlotRef {
  x: number; w: number;              // horizontal band, bands tile the measure with no gaps
  occupiedBy?: NoteId;
  gridTicks: number;
}
```

Generation, per measure/voice: union of (a) existing element onsets and (b) a regular grid at `options.insertGrid` resolution (default: the beat subdivision implied by the meter, e.g. an eighth in 4/4), **excluding grid ticks that fall inside an existing note's span** (between its onset and onset+duration, exclusive of the onset itself) — a note is atomic, so no slot may target a tick a `spliceVoice` call would have to reject. Ticks inside a *rest*'s span stay included: splitting a rest into `insertGrid`-sized pieces is exactly what `fillRests` already does. Each slot's x-band = midpoint-to-midpoint tiling.

`staffPosition = round(y*2)/2`. `pitch` = invert the pitch→y formula (`architecture.md`) + current key signature's alteration for that step — clicking the F line in D major yields F♯, not F♮ (`options.accidentals.insertAlteration: 'key' | 'natural'` switches this).

## Intents

One channel, not a callback per action:

```ts
type NotationIntent =
  | { type:'insertNote'; at:SlotRef; pitch:Pitch; duration:Duration }
  | { type:'activate'; target:HitResult }
  | { type:'selectElements'; ids:readonly NoteId[]; mode:'replace'|'toggle'|'range' }
  | { type:'modifyPitch'; ids:readonly NoteId[]; by:{diatonic:number}|{chromatic:number}|{pitch:Pitch} }
  | { type:'modifyDuration'; ids:readonly NoteId[]; duration:Duration }
  | { type:'modifyAccidental'; ids:readonly NoteId[]; policy:AccidentalPolicy }   // AccidentalPolicy — data-model.md
  | { type:'deleteElements'; ids:readonly NoteId[] }
  | { type:'moveElements'; ids:readonly NoteId[]; to:SlotRef; pitchDelta?:number }
  | { type:'navigate'; from:NoteId|null; direction:'next'|'prev'|'up'|'down'|'measureStart'|'measureEnd' }
  | { type:'contextMenu'; target:HitResult; client:{x:number;y:number} }
  | { type:'hover'; target:HitResult|null };

interface IntentContext { layout:LayoutResult; hit:HitResult|null; nativeEvent:PointerEvent|KeyboardEvent; preventDefault():void }

interface NotationInteraction {
  mode: 'view' | 'select' | 'insert';
  insertDefaults?: { duration: DurationToken | Duration; voice?: 0|1 };   // DurationToken — interface.md
  selection?: readonly NoteId[];              // controlled
  onIntent?: (intent: NotationIntent, ctx: IntentContext) => void;
}
```

Rules:

- Renderer holds no edit state — no selection, no draft note, no undo stack. `score` in, intents out, fully controlled. Testable without a DOM, StrictMode-safe by construction.
- `nativeEvent` stays out of the intent type — keyboard-driven insertion, MIDI-driven insertion, and a programmatic test all produce the same intent.
- Adding a feature is a new union member, not a new prop — a `switch (intent.type) { … default: return }` consumer is forward-compatible.

Phase 1: `mode:'insert'`, handle `insertNote`, ignore everything else. Every other row is additive:

| Feature | What changes |
| --- | --- |
| Pitch/duration/accidental edit | New intent members; a menu or keyboard handler produces them |
| Delete | `deleteElements` intent |
| Multi-select | `selection` prop + `selectElements` intent; render `[data-em-selected]`, CSS does the rest |
| Drag | pointerdown → track → pointermove resolves a live `hitTest` → `moveElements` on pointerup; needs a `ghost?: {pitch, slot}` preview prop, no layout re-run |
| Keyboard nav | `navigate` intent + `focusedId` prop + `tabIndex` on element `<g>`s |
| Context menu | `contextMenu` intent carries client coords; app renders its own menu |
| MIDI input | app converts MIDI to `insertNote`, applies it — renderer uninvolved |
| Caret-style entry | `caret?: SlotRef` prop rendered as a cursor; `navigate` moves it |

## Applying intents

`applyIntent` ships as a separate `notation-core` export, not wired into `<Notation>` — the quiz layer can reject an edit (wrong answer, locked measure) without fighting the renderer.

```ts
interface ApplyOptions { allowMeasureGrowth?: boolean }   // default false — see spliceVoice step 6
function applyIntent(score: ScoreDoc, intent: NotationIntent, opts?: ApplyOptions):
  { score: ScoreDoc; inverse: NotationIntent | null; diagnostics: Diagnostic[] };   // Diagnostic — data-model.md
```

`applyIntent` resolves the target measure's capacity (from its effective `TimeSpec`, inheriting forward same as `normalize`, `architecture.md`) and threads it into `spliceVoice` as `measureCapacityTicks` — the one piece of context `spliceVoice` itself can't derive from `elements` alone.

`inverse` makes undo one line: push it, pop and reapply for redo.

**Rule: a voice's total duration per measure never changes.** Every mutation reduces to one primitive:

```ts
/** Replace [tick, tick+ticks) in one voice with `insert`, re-padding the remainder with
 *  rests so total duration is unchanged. `measureCapacityTicks`: the containing measure's
 *  resolved capacity — needed because a `wholeBar` rest's ticks can't be read off its Duration
 *  (data-model.md's "Whole-bar rests and unrepresentable capacities"). */
function spliceVoice(elements: readonly VoiceElement[], tick: number, ticks: number,
                      insert: readonly VoiceElement[], divisions: number, measureCapacityTicks: number):
  { elements: VoiceElement[] } | { diagnostic: Diagnostic } {
  // 1. walk cumulative duration to find what covers [tick, tick+ticks), each element's ticks
  //    via elementTicks(el): the normal Duration->ticks formula, EXCEPT a `wholeBar` RestEl,
  //    whose ticks are always `measureCapacityTicks` (never derived from its Duration, which
  //    is pinned to 'whole' for rendering regardless of meter — data-model.md).
  //    notes are atomic (can't start/end mid-note); only a REST may split at either boundary.
  // 2. if [tick, tick+ticks) is not element-boundary-aligned and any covered element is a
  //    NOTE (not a rest) -> reject, diagnostic 'splice-crosses-note'. Slot generation already
  //    excludes these ticks (above), so this only fires on a hand-built/out-of-band call.
  // 3. remove the covered range.  4. splice in `insert`.
  // 5. insert-duration < ticks removed -> fillRests() the remainder, splice in alongside.
  //    a remainder that reconsumes the FULL remaining capacity re-collapses to one `wholeBar`
  //    rest instead of fillRests' normal decomposition — the two mechanisms don't overlap
  //    otherwise: fillRests never emits `wholeBar:true`.
  // 6. insert-duration > ticks removed -> reject, diagnostic 'measure-overfull', unless
  //    opts.allowMeasureGrowth (ApplyOptions, above) -> extend the measure's capacity instead.
}

/** Decompose a tick length into the fewest notatable rest durations. Rests aren't tied
 *  (unlike notes), so 5 sixteenths -> a quarter rest + a 16th rest, not one glyph.
 *  Greedy: largest power-of-two duration that fits, up to 2 dots (model cap), recurse
 *  the remainder. Terminates for any positive tick count. */
function fillRests(ticks: number, divisions: number): RestEl[];
```

- `insertNote` = `spliceVoice(elements, slot.tick, durationTicks(duration), [note], divisions, measureCapacityTicks)` — consumes exactly the note's duration out of whatever rest occupies that time.
- `deleteElements` = `spliceVoice(elements, tick, ticks, [], divisions, measureCapacityTicks)` — empty `insert` always triggers step 4, so the deleted note becomes rest(s) of equal duration, not a hole and not a shift.
- `moveElements` = a delete-at-old + insert-at-new composed as one intent, one inverse — two `spliceVoice` calls, each with its own measure's `measureCapacityTicks` (the source and target measures may differ; `SlotRef` doesn't constrain a move to stay within one).

Why this is necessary, not decorative: the naive implementation (`array.filter(e => e.id !== id)`) silently shifts every later element's *derived* onset earlier by the deleted duration — the measure still sums correctly while sounding and rendering wrong (`data-model.md`).

## Accessibility

Every note `<g>`: `role="img"` + `aria-label={box.label}` ("E flat 4, quarter note, measure 2"). `insert`/`select` mode adds `role="button"` + `tabIndex`. `<svg>` root: `aria-label` summarizing the score. Always render the answer as text alongside the notation — `ElementBox.label` exists so the app builds that text without re-deriving it.

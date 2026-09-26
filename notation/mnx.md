# MNX

MNX (W3C Community Group, `w3c-cg/mnx`) is the component's only score format — public APIs take and return plain MNX, never a private model or an "MNX + extensions" shape (`AGENTS.md`). This file covers the subset the engine actually lays out, how unsupported MNX degrades, time representation, IDs, diagnostics, and how the vendored schema is upgraded. `interface.md` covers the `score` prop and authoring; `architecture.md` covers where in the pipeline MNX is read.

## Where MNX is read

Only `notation-engine/src/layout/normalize.ts` reads the raw MNX document. It calls `readMnx()` (`notation-model/src/mnx/read.ts`) to check `mnx.version`, then flattens `parts[0]`'s sequences into flat `NormalizedElement`/`NormalizedGap` records (`layout/normalize.ts`) that carry only what later stages need — a resolved clef/key/time per measure, one flat list of events per voice. `layout/temporal.ts` turns those into `TemporalElement` rows (onset/duration in ticks) — it does timing only, it does not read the document. Every stage after `temporal` reads only these flat records (`layout/records.ts`'s types), never the MNX document itself. This is the boundary `AGENTS.md` requires: if MNX gains a field the engine doesn't yet support, exactly one file (`normalize.ts`) changes.

`layoutScore(doc: MnxDocument, options)` is the pipeline entry point; `options.divisions` (ticks per quarter note) defaults to 3360.

## Supported subset

Reading `parts[0]` only, `staff 1` only, up to 2 sequences (voices) per measure:

| MNX construct | Engine mapping |
| --- | --- |
| `global.measures[i].time` | `TimeSpec { beats, beatType, symbol? }`; `display: 'common'`/`'cut'` → `symbol`. Invalid/missing → inherits the previous measure's time, diagnostic `invalid-time-signature` |
| `global.measures[i].key.fifths` | `KeySpec { fifths }`, clamped to −7..7 + `mnx-unsupported` when clamping actually changed the value. Missing/non-numeric `fifths` → inherits the previous measure's key, diagnostic `invalid-key-signature` |
| `global.measures[i].barline.type` | `barlineEnd`: `regular`→`single`, `double`→`double`, `dashed`→`dashed`, `final`→`final`, `noBarline`→`none`. Anything else drawn as `single` + `mnx-unsupported` |
| `global.measures[i].repeatStart` / `.repeatEnd` | `barlineStart: 'repeat-start'` / `barlineEnd: 'repeat-end'`. `repeatEnd.times !== 2` still draws a plain end-repeat + `mnx-unsupported` |
| `global.measures[i].tempos[]` | `TempoEvent { tick, bpm, beatUnit? }` — `location.fraction` → an offset from the measure start, added to the running tick total; `value` → `beatUnit` (defaults to a quarter when the value's base isn't supported) |
| `parts[0].measures[i].clefs[]` | `{ sign, staffPosition, octave? }` → `ClefSpec`. `staffPosition` 0 = the staff's middle line: G/−2 = treble, F/2 = bass, C/0 = alto, C/2 = tenor. `octave: 1 \| -1` → `octaveShift`. Any other G/F/C sign/position combination falls back to the nearest of treble/bass/alto by sign, + `mnx-unsupported`. A `sign` outside `G`/`F`/`C`/`P` has no fallback — the previous clef is kept, + `mnx-unsupported`. A clef whose `position` fraction is mid-measure is applied starting the *next* measure (not drawn mid-bar) + `mnx-unsupported` |
| `sequences[]` (`staff: 1`, up to 2) | Voice 0 = first sequence, voice 1 = second. A 3rd+ sequence is dropped, diagnostic `too-many-voices` |
| `event` with one `notes` entry | note |
| `event` with `notes.length > 1` | chord — one `ElementNote` per member |
| `event.rest` | rest; `rest.staffPosition` → the rest's forced staff line/space |
| `sequence.fullMeasure` | a whole-bar rest (`wholeBar: true`) — see "Whole-bar rests" below |
| `tuplet` container | flattened: children get a `TupletRef { id, actual, normal, display? }`, `actual`/`normal` from `inner`/`outer` reduced to lowest terms (`tupletRatio`, `notation-model/src/mnx/time.ts`). `bracket`/`showNumber`/`placement` are carried through to `display` (only when at least one is given); `showValue` is not drawn, `mnx-unsupported`. A tuplet nested inside another is flattened into one combined ratio + `mnx-unsupported` (message says the content "keeps only the outer tuplet's ratio" when the inner ratio itself is unsupported, vs "laid out untupled" for an unnested tuplet); its `display` is the innermost tuplet's own |
| `parts[0].measures[i].beams[]` | See "Beams" below |
| `note.accidentalDisplay` | absent → `'auto'`; `show: false` → `'never'`; `show: true` → `'always'`; `show: true` + `enclosure.symbol: 'parentheses'` → `'cautionary'` |
| `note.ties[].target`/`targetType` | resolved to a start/stop pair by MNX note id — the earlier note gets `tie: 'start'`/`'continue'`, the resolved target gets `'stop'`/`'continue'`. Only `targetType: 'nextNote'` or an absent `targetType` is drawn this way; `crossVoice`/`arpeggio`/`crossJump` are not drawn, + `mnx-unsupported`. An unresolved target → diagnostic `tie-target-unresolved`, no tie drawn. `tie.lv` (laissez-vibrer) is not drawn, `mnx-unsupported` |
| `event.slurs[]` | `NormalizedSlur { id, from, to, startNote?, endNote?, side?, measureIndex }`, `id` = `slur.id` ?? `${fromEventId}.slur${k}`. `target` resolves to the tied-to event's laid-out ids; an unresolved `target`/`startNote`/`endNote` → diagnostic `slur-target-unresolved`, the slur is not drawn. `lineType` other than `'solid'` → drawn solid, `mnx-unsupported`; `sideEnd` differing from `side` → the start `side` is used for the whole curve, `mnx-unsupported`. See "Slurs" in `engraving.md` for direction/clearance |
| `event.stemDirection` | `'up'`/`'down'` override; anything else is the engine's own resolution (`engraving.md`) |
| `event.markings.breath` | drawn as `'comma'` unless `symbol` is something other than `'comma'`/`'auto'`, then still drawn as a comma + `mnx-unsupported` |
| `event.markings.caesura` | drawn as `'caesura'`; a caesura + a breath on the same event draws only the caesura + `mnx-unsupported`; a non-default `shape`/`marks` still draws a plain caesura + `mnx-unsupported` |
| `scores[0].pages[].systems[].measure` | forces a system break after the *previous* measure (a system starting at measure `k` → break after `k−1`). No `pages`/`systems` at all → greedy breaking (`engraving.md`). A `measure` id that doesn't resolve → diagnostic `system-measure-unresolved`. More than one entry in `scores[]` → only `scores[0]` is used, + `mnx-unsupported` |
| first measure, non-empty, no `fullMeasure`, shorter than the meter | pickup — no padding, no diagnostic (see "Pickup measures" below) |
| any other measure shorter than its meter | padded with synthetic trailing rests + diagnostic `measure-underfull` |
| a measure longer than its meter | truncated at the barline + diagnostic `measure-overfull` (error) |
| `space` sequence content | advances time without emitting a note/rest/chord — invisible |

Note values: `breve`, `whole`, `half`, `quarter`, `eighth`, `16th`, `32nd`, `64th`, 0–2 dots (more than 2 dots draws 2 + `mnx-unsupported`). The MNX enum also has `duplexMaxima`/`maxima`/`longa` above breve and `128th`..`4096th` below 64th — an event using one of those is skipped entirely (`invalid-duration` if the value can't even be read, `mnx-unsupported` if the base is simply outside the supported set).

## Unsupported MNX

`AGENTS.md`: unsupported MNX renders what's possible plus an `mnx-unsupported` diagnostic, never throws. Constructs the engine recognizes but does not lay out — each reported once per measure (or once per document, for whole-document constructs), via `Reader.unsupported()` in `normalize.ts`:

- Multiple parts (only `parts[0]` is laid out), a part with `staves > 1` (only staff 1), a part's `transposition`/`kit` (percussion kits aren't laid out)
- A 3rd+ sequence in a measure (`too-many-voices`, listed separately below since it isn't gated through `unsupported()`); a sequence on `staff !== 1`
- Percussion clefs and other unrecognized clef sign/position pairs (fall back to the nearest of treble/bass/alto); a clef octave outside `-1..1`
- Grace notes, multi-note tremolo (its time is left blank via a `space`), lyrics, dynamics, ottavas, arpeggios/non-arpeggios, staff configs, measure repeats
- `slur.lineType` other than `'solid'` (drawn solid); `slur.sideEnd` differing from `slur.side` (the start side is used for the whole curve)
- `tuplet.showValue` (only the actual count is drawn, per `showNumber`/`options.tuplets.showRatio`)
- `ending`, `jump`, `segno`, `fine`, `fermata` (global or per-event), multimeasure rests
- A measure's `number` override (ignored — measures are numbered positionally)
- `note.written`/`note.perform` (sounding pitch is drawn instead; perform hints are ignored)
- Cross-staff notes/events/tuplets (laid out on staff 1 regardless)
- Any `event.markings` key besides `breath`/`caesura`/`id`/the internal `_c`/`_x` reserved names
- An accidental `alter` outside `-2..2` (clamped, drawn with the clamped value); a key signature's `fifths` outside `-7..7` (clamped, drawn with the clamped value)
- A tie's `targetType` other than `nextNote`/absent (`crossVoice`, `arpeggio`, `crossJump` — not drawn)
- Nested tuplets (flattened to one combined ratio), a tuplet whose `inner`/`outer` note value isn't supported (its content is laid out untupled, or keeps only the outer ratio when nested)
- More than one `scores[]` entry (only the first score's layout is used)
- A synthesized positional id that collides with an id already in use (disambiguated with a `~2`, `~3`, … suffix, diagnostic `id-collision`); an explicit id reused on more than one laid-out element (diagnostic `id-collision`, first occurrence wins)

One construct the engine reads but doesn't yet lay out is downstream of `normalize`, not gated through the same `unsupported()` helper, so it gets its own diagnostic code instead of `mnx-unsupported`:

- Anything past 2 sequences never reaches `temporal` at all — diagnostic `too-many-voices` (warning), from `normalize.ts`, listing how many were dropped.

A 2nd voice (`sequences[1]`) is parsed, carried through `temporal`, and laid out by `layout/vertical.ts` (`engraving.md` "Two voices").

## Beams

`mnx.support.useBeams` decides whether the engine invents beams (`w3c-cg/mnx` support object docs; `phase3-rhythm.md` "DECISIONS FROM RESEARCH"):

- **`useBeams: true`**: only what's explicitly in a measure's `beams[]` gets beamed. A measure with no `beams` entry is left entirely unbeamed (flags).
- **`useBeams` false or absent** (the default): a measure with an explicit `beams[]` uses exactly that; a measure with none is auto-beamed by the engine, using `notation-model/src/mnx/beam.ts`'s `beamGroups` (driven by `options.beaming` — see `interface.md`). Auto-beaming never goes through MNX: it calls the model's grouping core directly with the engine's own element ids, so it never mints an id or mutates anything.

Either way, the result is one `NormalizedBeam` per beamed run:

```ts
interface BeamSegment { level: number; first: NoteId; last: NoteId; hook?: 'left' | 'right'; }
interface NormalizedBeam {
  id: string;
  measureIndex: number;
  voice: 0 | 1;
  elements: readonly NoteId[]; // every element in the group's span, including a rest it crosses
  segments: readonly BeamSegment[]; // secondary levels (2 = 16th, 3 = 32nd, ...) and their hooks
}
```

`elements` holds every id from the first to the last referenced event, in order — a rest an explicit beam spans stays in the span (MNX allows this; auto-beaming never beams over a rest, so this only happens for explicit `beams`). `segments` covers levels beyond the primary (eighth) beam: when the MNX `beams[].beams` nesting is present, its levels and `direction`s (or the derived direction, when a nested single-event group omits `direction`) are read directly; when it's absent, the engine derives them from each element's written duration — a maximal run of elements at the same level becomes one segment, a run of one becomes a hook (`left`/`right`, pointing at the group's own end when the singleton is first/last, otherwise `right` when its onset begins an even-numbered level unit since the group's start and `left` when it's the second of that pair — engraving.md "Beaming").

**Validation** is one rule (`phase3-rhythm.md` "SCOPE ADJUSTMENTS"): a `beams[]` entry that references an unknown event id, an event in a different measure or voice, a note/chord whose written value is a quarter or longer, or has fewer than two real notes, is dropped — flags are drawn, diagnostic `beam-invalid` — including a beam crossing a barline (D11 called this out specifically; the general rule already covers it, since the referenced events resolve to different measures). An event already claimed by an earlier beam in the same measure is likewise dropped from any later one that reuses it. A repeated id in the same `beams[].events` list is deduplicated before the two-note check, and any member at or past the voice's own measure capacity (what `temporal.ts` would truncate as `measure-overfull`) is dropped first too, so a beam can never reference an event layout never produces.

Beam id = the MNX `beams[].id` when given, otherwise `{firstElementId}.beam` via the same `synthId` every other positional id uses.

## ID rule

Every element the engine lays out gets an id: the MNX `id` when the document supplies one, otherwise a deterministic positional id. Content an app references — playback highlight, quiz lookups, click targets — **must** carry a real MNX `id`; a positional id is stable only until the document is edited.

Id synthesis is a single shared implementation, `elementIds(doc)` in `notation-model` (`@polyhymnia/notation-model`'s `elementIds`/`ElementIds`/`NoteId`). It walks `parts[0]`'s staff-1 sequences once, in the same order and with the same rules the engine used to apply inline, and hands back a position-keyed lookup (`idAt(pos)`/`nodeOf(id)`, where a position is `{ measureIndex, sequenceIndex, path }` plus a `note` index for chord members or a `full` marker for a full-measure rest) plus `mint(candidate)`/`resolve(explicit, candidate)` for ids assigned outside that walk (beams). `notation-engine`'s `normalize.ts` no longer synthesizes ids itself; it only looks up what `elementIds` already computed.

Positional id shapes (measure `m`, sequence `s`, event index `k` within its voice):

| Element | Positional id |
| --- | --- |
| An event (note/rest/chord) | `m{measure}.s{sequence}.e{k}` |
| A chord member | `{eventId}.n{k}` |
| A tuplet | `m{measure}.s{sequence}.t{k}` |
| A full-measure rest | `m{measure}.s{sequence}.full` |
| A synthetic padding rest (underfull measure) | `m{measure}.v{voice}.pad{k}` |
| A beam | the MNX `beams[].id`, or `{firstElementId}.beam` |

`k` is advanced by every event *and* by every child of a `grace` or `tremolo` container, even though those children are never themselves laid out or given an id — so an unlabeled event after a grace group or a tremolo gets the index it would have had if those children had been ordinary events.

Every explicit `id` in the document is scanned up front, so a positional id is never silently assigned to two different elements: if a synthesized candidate collides with an id already in use (explicit or previously synthesized), it gets a deterministic `~2`, `~3`, … suffix instead, plus diagnostic `id-collision`. Two elements that explicitly share the same `id` also get `id-collision`; the first occurrence keeps the id, the rest are unaddressable by it. All `id-collision` diagnostics — element/tuplet/event ones from the model's own id pass, then any from beam id resolution — are appended after every other diagnostic, so they always land at the end of `NormalizedScore.diagnostics`.

## Time: rationals internally, integer ticks at the boundary

- Inside the layout pipeline (from `temporal` on): `Rational { n: number; d: number }` (`notation-model/src/mnx/rational.ts`, re-exported as `Rational` from `@polyhymnia/notation-model/mnx`), gcd-normalized. Exact arithmetic, no float epsilon bugs (`3 × triplet-eighth = 1 quarter` exactly).
- `normalize.ts` converts every MNX note-value/tuplet/fraction to a `Rational` via `noteValueLength`/`tupletRatio` (`notation-model/src/mnx/time.ts`) before any arithmetic; `temporal.ts` sums those rationals to get onsets and only rounds to integer ticks (`Rational.toTicks`) when producing its output rows.
- `options.divisions` (default 3360 = 2⁵×3×5×7) is an engine option, not document data — MNX carries no `divisions` field. 3360 divides evenly down to a 64th (needs 2⁴) crossed with triplets/quintuplets/septuplets; conventional 768/960 cannot represent a 64th-note septuplet exactly. `readMnx`/`normalize` reject a non-positive/non-integer `options.divisions`, diagnostic `invalid-divisions`, and fall back to the default.

## Pickup and fullness rules

Every tick of a measure must be covered — the engine still enforces this, but the source of truth for "did the content fill the bar" is now MNX content itself, not a model-level fullness rule on input:

- **Pickup**: the first measure only, non-empty, no `fullMeasure`, and shorter than the prevailing meter → `NormalizedMeasure.pickup = true`. Its capacity for layout purposes is exactly whatever its content sums to — no padding, no diagnostic. A pickup measure never restates the time signature on the following measure (that only happens on an actual time change).
- **Underfull** (a later measure shorter than its meter): `temporal.ts` pads with synthetic trailing rests (`decomposeLength` — fewest notatable rest durations, ≤2 dots) and emits `measure-underfull` (warning).
- **Overfull** (longer than its meter): truncated at the barline and `measure-overfull` (error) — never a throw; malformed content degrades visibly in a live quiz rather than crashing it.

### Whole-bar rests

`sequence.fullMeasure` (or `event.rest` alone with no notes, drawn as the sole content) becomes `NormalizedElement.wholeBar: true`: always the single whole-rest glyph (`base: 'whole'`), regardless of meter, but its actual duration in ticks is the measure's real capacity — a 9/8 or 5/4 bar's whole-bar rest is 4.5 or 5 quarters long even though no `{base, dots}` combination can represent that exactly. `temporal.ts`'s `wholeBarShare` divides the measure's remaining capacity evenly across however many whole-bar rests share the bar (normally one).

## Diagnostics

One shape everywhere (`notation-model/src/mnx/read.ts`'s `Diagnostic`, re-exported from `@polyhymnia/notation-model/mnx`):

```ts
interface Diagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  measureIndex?: number;
  voice?: 0 | 1;
  tick?: number;
}
```

Codes actually produced today (verify against `normalize.ts`/`temporal.ts`/`vertical.ts`/`read.ts` — this list is exact as of the current pipeline, not aspirational):

| Code | Severity | Where | Meaning |
| --- | --- | --- | --- |
| `mnx-invalid` | error | `readMnx` | The document isn't an object, or has no `mnx` key |
| `mnx-unsupported-version` | error | `readMnx` | `mnx.version` isn't the version this build supports |
| `mnx-unsupported` | warning | `normalize` | A recognized-but-unsupported construct, one per construct per measure (or per document) — see "Unsupported MNX" above |
| `no-parts` | warning | `normalize` | No `parts[0]`; nothing to lay out |
| `no-measures` | warning | `normalize` | `global.measures` is empty |
| `measure-count-mismatch` | warning | `normalize` | `parts[0].measures.length !== global.measures.length`; lays out `global`'s count |
| `missing-sequences` | warning | `normalize` | A part measure has no `sequences` array; treated as empty |
| `too-many-voices` | warning | `normalize` | More than 2 sequences in a measure; the rest are dropped |
| `invalid-divisions` | warning | `normalize` | `options.divisions` isn't a positive integer; falls back to 3360 |
| `invalid-time-signature` | warning | `normalize` | A measure's `time` isn't a valid `{count, unit}`; inherits the previous measure's |
| `invalid-key-signature` | warning | `normalize` | A measure's `key.fifths` is missing or not a finite number; inherits the previous measure's key |
| `invalid-duration` | warning | `normalize` | An event's `duration` has no readable `base`; the event is skipped |
| `invalid-pitch` | warning | `normalize` | A note's `pitch` is missing `step`/`octave`; drawn as C4 |
| `tie-target-unresolved` | warning | `normalize` | `tie.target` doesn't resolve to a laid-out note id; the tie is ignored |
| `tie-target-not-adjacent` | warning | `normalize` | `tie.target` doesn't resolve to the next event of the same voice; drawn anyway |
| `slur-target-unresolved` | warning | `normalize` | `slur.target`/`startNote`/`endNote` doesn't resolve to a laid-out note/event id; the slur is not drawn |
| `system-measure-unresolved` | warning | `normalize` | A `systems[].measure` id doesn't resolve to a global measure; ignored |
| `id-collision` | warning | `normalize`, `temporal` | A synthesized positional id collided with an id already in use (disambiguated with a `~n` suffix), or the same explicit id was assigned to more than one laid-out element (first occurrence wins) |
| `zero-length-element` | warning | `temporal` | An event's resolved duration is zero (or negative); skipped |
| `measure-underfull` | warning | `temporal` | A non-pickup measure doesn't fill its capacity; padded |
| `measure-overfull` | error | `temporal` | A measure exceeds its capacity; truncated at the barline |
| `beam-invalid` | warning | `normalize` | A `beams[]` entry references an unknown/cross-measure/cross-voice/non-beamable event, has fewer than two notes (after deduplicating repeated ids and dropping members at or past the measure's capacity), or reuses an event another beam already claimed; dropped |
| `beam-grouping-invalid` | warning | `normalize` | `options.beaming.beatGrouping[meter]` doesn't sum to the bar; falls back to the default table (`engraving.md`), once per meter |
| `mnx-unsupported` ("mixed stem directions in a beam") | warning | `vertical` | Two notes in the same beam group carry conflicting explicit `stemDirection`; the first one wins |
| `tie-unplaced` | warning | `curves` | A resolved tie's `from`/`to` note wasn't laid out (dropped upstream); no curve drawn |

## Pinned schema, examples, and updating

The MNX schema and its 52 official example documents are vendored at one pinned commit in `packages/notation-model/schema/`:

```
schema/
  mnx-schema.json        # docs/mnx-schema.json at the pinned commit
  examples/<slug>.json   # docs/static/examples/json/<slug>.json, 52 files
  SOURCE                 # commit, commit date, schema $id, supported mnx.version
```

Never hand-edit any of these, or the generated `notation-model/src/mnx/types.ts` (`json-schema-to-typescript` output, checked in, regenerated by `pnpm gen:mnx-types`) — `AGENTS.md`. Upgrade deliberately with:

```sh
pnpm mnx:update <commit>
```

which re-downloads the schema and examples at that commit, regenerates the types, and rewrites `SOURCE`. Type errors and the conformance test below show exactly what an upgrade touches. Upgrades happen on purpose (a new feature is needed, or on a rough monthly cadence), never automatically — the spec is still moving (renamed keys, enum casing changes, `measure-global.index` removed and the version bumped to 2 have all happened within the last year).

## Testing

- **Schema test** (`notation-engine/test/schema.test.ts`): every fixture in `notation-engine/test/fixtures/` validates against the pinned `mnx-schema.json` with Ajv (devDependency only — never in a runtime bundle, `AGENTS.md`).
- **Conformance test** (`notation-engine/test/conformance.test.ts`): runs all 52 vendored official examples through `layoutScore()`. Every one must lay out without throwing; each is asserted against an exact expected diagnostic-code list (`EXPECTED_CODES` in that file) — most produce `[]` or `['mnx-unsupported']`, a few hit `no-measures`/`system-measure-unresolved`/`measure-underfull`/`measure-count-mismatch`/`beam-invalid` for constructs described above. This is what actually proves the mapping table in this file, not the table itself — re-run it after any `normalize.ts`/`temporal.ts` change.
- **MNX↔engine mapping test** (`notation-engine/test/mnx-mapping.test.ts`): targeted cases for individual mapping rules (clef resolution, tie resolution, tuplet ratios, barline types, beam resolution/auto-beaming, …).
- **Pipeline test** (`notation-engine/test/pipeline.test.ts`) keeps its malformed-input cases as malformed MNX — feeding `normalize`/`temporal` documents missing fields, invalid divisions, too many voices, etc., and asserting the diagnostic degrade path rather than a throw.

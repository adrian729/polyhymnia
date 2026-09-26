# Engraving algorithms

## Staff

5 lines per staff, one `RectShape` each, thickness `staffLineThickness` (0.13sp, architecture.md), spanning the system's full justified width — drawn once per staff per system, independent of content.

## Stems

Direction and length for every notehead outside a beam group (stage 5, `vertical` — architecture.md). Beamed notes use the same direction rule; their length is finalized post-justify (`Beaming`, below — stage 9).

```
1. direction: staffPosition < 2.0 (above middle line) -> down; > 2.0 (below middle line) -> up;
   == 2.0 -> down (tie-break, matches Beaming's group rule below). Chord: vote by the member
   furthest from the middle line. MNX `event.stemDirection` (mnx.md) overrides when set.
2. length: 3.5sp from notehead centre, font anchors (`stemUpSE [1.18,0.168]` / `stemDownNW
   [0.0,-0.168]` on noteheadBlack) — same nominal length beamed or not; only a beam group's
   justify-time re-terminate (Beaming step 8, below) changes it after this stage.
3. thickness: `stemThickness` (0.12sp, architecture.md). `stem:'none'` suppresses rendering;
   direction still resolves (ledger-line-side accidental placement needs it) even undrawn.
4. chord "second" shift (rod-width `chord-shift`, Horizontal spacing below): members a step
   apart shift the upper notehead one notehead-width right of the stem, lower stays left — same
   rule Two voices (below) uses across voices, applied here within one chord's own stem.
```

## Beaming

Grouping and drawing are both implemented (`mnx.md` "Beams"): an eighth note or shorter that lands in a beam group gets no flag, and its stem is re-terminated at the beam line by `layout/beams.ts` (stage 9).

One piece, per `phase3-rhythm.md` "DECISIONS FROM RESEARCH":

**The grouping core**, `beamGroups(meter, events, options?, pickupOffset?)` in `notation-model/src/mnx/beam.ts` — pure, given one voice's events (id, kind, written base/dots, tuplet-scaled length) in order, returns the primary groups (≥2 beamable events each) as arrays of ids. It never mints ids and never touches MNX. Its only caller is **the engine's auto-beaming**, `layout/normalize.ts`: for a measure with no explicit `beams` and `mnx.support.useBeams !== true`, it calls `beamGroups` directly with the engine's own element ids (never through MNX), and derives secondary levels/hooks from written durations itself (`mnx.md` "Beams"). A measure *with* explicit `beams` uses exactly those, nested levels/hooks included when given. There is deliberately no MNX-writing counterpart to `beamGroups` — nothing consumes explicit beams as input yet, so one was never built (AGENTS.md: no speculative code).

Only durations < quarter beam; a rest never joins an auto-beamed group (explicit MNX `beams` may still span one — mnx.md). The engine's beat-group boundaries are resolved by `beamGroups`' `options` (`GroupingOptions`/`NotationOptions.beaming`): a supplied `beatGrouping[meter]` (validated to sum to the bar; invalid → diagnostic `beam-grouping-invalid`, falls back to the default below) beats the default table, which is fixed — no "guessed, with a diagnostic" tier anymore, since every meter below has one deterministic answer:

| Meter | Group sizes (eighths) | Note |
| --- | --- | --- |
| 2/4 | `mergeBeats` (default true): `[4]`; else `[2,2]` | merges to one group only when every note is a plain unbroken eighth — 16ths/dotted rhythms use the per-beat `[2,2]` regardless |
| 3/4 | `[6]` / `[2,2,2]` | same plain-eighths condition |
| 4/4 | `[4,4]` / `[2,2,2,2]` | merges within each half, **never across the middle**, even with `mergeBeats` on |
| 2/2 | `[4,4]` | per half-note beat, unaffected by `mergeBeats` |
| 3/8 | `[3]` | whole bar |
| 6/8, 9/8, 12/8 | `[3,3]`, `[3,3,3]`, `[3,3,3,3]` | groups of 3 eighths (the dotted-quarter beat) |
| 5/4 | `[2,2,2,2,2]` | per quarter |
| 5/8 | `[3,2]` | |
| 7/8 | `[2,2,3]` | |
| other odd `n`/8 | 3s then a final 2 | e.g. 11/8 → `[3,3,3,2]` |

Non-plain content (any 16th/32nd/64th, or a dotted note, present in the measure) always uses the *unmerged* per-beat sizes (the "else" column above, or one group per beat for the other meters) — "16ths and mixed rhythms: per beat, never merged." Tuplet content is never mixed with plain notes in the same group — a beam breaks entering/leaving/switching a `tuplet`, and inside one, only the rest/quarter-or-longer breaks apply, not the beat-boundary check (there's no outer beat inside a tuplet's own written-time bubble). A pickup measure's boundaries are anchored to the *end* of the bar (`pickupOffset` = full bar length − the voice's own content length), not the start.

Secondary levels/hooks, when derived (no nested MNX `beams`): for level `L` = 2 (16th), 3 (32nd), 4 (64th) — a maximal run of consecutive notes whose written value needs at least `L` beams becomes one `BeamSegment`; a run of one becomes a hook. A hook points at the group's own end when the singleton sits at the start/end of the *primary* group (`right`/`left`); otherwise it points `right` when the note's onset begins an even-numbered level-`L` unit since the group's start (the first of a pair) and `left` when it's the second — e.g. the 16th in a dotted-8th+16th hooks `left`, toward the dotted note it pairs with; 16th-8th-16th hooks `right` then `left`. A rest inside the span breaks a run/hook exactly like a too-long note would (it never joins one). When nested MNX `beams` are given instead, their levels and `direction`s are read as-is (an explicit direction always wins; an omitted or `auto` one on a single-event nested beam falls back to the same start/end/onset rule).

Group stem rule (`vertical.ts`): every note in a beam group shares one stem direction, voted by the notehead furthest from the middle line across the whole group (chord members included), tie → down. An explicit MNX `stemDirection` on any member wins; members that disagree keep the first one's direction and report `mnx-unsupported` ("mixed stem directions in a beam"). A rest inside the group gets no stem; a beamed note gets no flag.

Geometry, per group, computed by `layout/beams.ts` (stage 9) from the resolved `NormalizedBeam` (`mnx.md`), run **after justification** (needs final x):

```
1. stem direction: from Stems (above) — already resolved per group; 2-voice forces it
   instead (skip, see Two voices below).
2. nominal stem ends: same font anchors as Stems (above), extend 3.5sp from notehead centre.
   A chord's stem uses its outermost head in the stem direction, same as an unbeamed chord.
3. raw slope from OUTER note endpoints (not regression — engraving convention anchors the
   outer notes; regression visibly disagrees with the first/last note).
4. constrain:
     outer endpoints equal (includes the "all equal" and "valley"/"peak" cases) -> slope = 0
     slope = clamp(slope, -0.25, 0.25)  sp/sp
     totalRise = clamp(slope * span, -2.5, 2.5) sp, recompute slope
5. quantize left end to quarter-space grid (yLeft = round(yLeft*4)/4).
6. shift the whole beam so every stem clears MIN_STEM = 3.0sp, measured to its own
   *innermost* level (the beam line nearest its notehead — the binding constraint, since a
   note's stem always continues on to the outer primary line regardless); a beamed stem on a
   note far off the staff is shifted further still so it reaches at least the middle line —
   except in a two-voice measure, where a voice's beam never has to reach the middle line
   (Two voices, below).
7. beam shape: a parallelogram `PathShape` (`cls: 'beam'`, `el` = the beam's own id) — a
   thin slab (vertical thickness, not perpendicular) whose near edge is exactly the line
   every re-terminated stem in it touches, and whose far edge sits `beamThickness` (0.5sp)
   away from the notehead. Level `n` (n >= 2) offsets that edge `(n-1) * 0.75sp`
   (beamThickness 0.5 + beamSpacing 0.25) further toward the noteheads.
8. stems re-terminate at the primary (level-1) beam line, not at nominalStem — the single
   source of truth `emit.ts` applies as a stem override; a note's own higher levels sit
   further toward its notehead but its stem is drawn the full way to the primary line.
```

Secondary beams/hooks are already resolved by the time drawing runs (`NormalizedBeam.segments`, `mnx.md`) — draw each `BeamSegment` as a level-`n` parallelogram (level offset per step 7 above) across `first`..`last`; a segment with a `hook` draws `min(1.0sp, half the distance to its neighbour)` toward the group instead of the full width.

Out of scope: cross-staff beaming, feathered beams (additive later; needs a second staff).

`MAX_SLOPE=0.25`, rise cap `2.5sp` are engraving heuristics (Gould, *Behind Bars*), not measured — tune against the test gallery (`roadmap.md`).

## Tuplets

Bracket/numeral drawing is implemented (`layout/tuplets.ts`, stage 9, after beams — needs beam geometry for the suppressed-bracket case below). A single nesting level is drawn: MNX `tuplet` containers (`inner`/`outer` note-value quantities) mark a contiguous run of sequence content; `normalize.ts` resolves the ratio (`tupletRatio`, `mnx.md`) and the `grouping` stage (`architecture.md`) resolves the flattened run to a span, including the resolved `showBracket` bracket decision below:

```ts
interface TupletSpan { startTick: number; endTick: number; actual: number; normal: number; elements: readonly NoteId[]; display: TupletDisplay; showBracket: boolean }
```

`display` carries the MNX `bracket`/`showNumber`/`placement` settings through (`mnx.md`); `showBracket` is `grouping.ts`'s resolution of the bracket rule below — `'yes'`/`'no'` override it, `'auto'`/absent applies it. `layout/tuplets.ts` only reads `showBracket`, never `display.bracket` directly.

Duration scaling (`actual`:`normal`, e.g. 3:2) is applied per-element at the `normalize`/`temporal` stages (`mnx.md`), before grouping ever sees the span. `normalize.ts` already only reads events inside the `tuplet` container's own `content`, so a span can never cross a barline by construction — there's no `tuplet-crosses-barline` diagnostic to reject with. A `tuplet` nested inside another `tuplet` is flattened into one combined ratio + `mnx-unsupported` (`mnx.md`), rather than drawn as nested brackets.

Bracket rule: `display.bracket` (`mnx.md`) `'yes'`/`'no'` always wins. `'auto'` (or absent) — **omit the bracket** when every element in the span beams together as one run and no rest is in the span; the beam already marks the group, draw only the numeral, centered above/below the beam. **Draw the bracket** otherwise (unbeamed, only partially beamed, or a rest in the span).

Geometry, when drawn (post-justify, same as beams):

```
1. endpoints (x0,yBracket)-(x1,yBracket): yBracket = 1.0sp outside the extreme notehead/stem of
   the span — above if any stem in the span points up, below if down; mixed -> above. Line
   thickness `tupletBracketThickness` (0.16sp, architecture.md).
2. hooks: ~0.5sp vertical ticks at each end, same thickness, pointing toward the notes —
   omitted on whichever end abuts a beam (the beam line already reads as that edge).
3. numeral: `display.showNumber` (`mnx.md`) wins when given — `'noNumber'` draws nothing,
   `'inner'` draws `actual` only, `'both'` draws `actual`:`normal`; absent falls back to
   `options.tuplets.showRatio` (`interface.md`, default false → `actual` only).
   Tuplet-digit glyphs (E880–E889) + tupletColon (E88A). When the bracket is drawn: centered
   at the bracket midpoint, 0.3sp gap beyond the bracket line. When the bracket is suppressed
   (the beamed-as-one-run case above): centered at the span's middle x, 0.3sp beyond the
   beam line at that x — following the beam's own slope, not the flat `yBracket` formula in
   step 1 above, and not sharing the bracket's fixed 1.0sp offset either.
```

Nested/compound tuplets: MNX already nests `tuplet` containers natively, so there's no data-model change needed to add this — it's purely an engine limitation (`README.md`).

## Horizontal spacing and justification

Every column: a **rod** (min width = largest intrinsic width in it: accidental block + notehead advance + chord shift + dots + fixed padding, left-to-right order matching the column layout below) and a **spring** (ideal width, function of the column's *duration until the next column*).

```
idealWidth(d) = BASE * (d/quarter)^K     BASE = 3.2 sp, K = 0.55 (options.spacing.{base,k}; K=1 =
                                          strictly proportional — useful for a rhythm-teaching display)
```

| Duration | (d/q)^K | Ideal width | Rod (min) | Dominant |
| --- | --- | --- | --- | --- |
| 16th | 0.467 | 1.49 sp | ~1.6 sp | rod |
| 8th | 0.683 | 2.19 sp | ~1.6 sp | spring |
| quarter | 1.000 | 3.20 sp | ~1.6 sp | spring |
| half | 1.464 | 4.69 sp | ~1.6 sp | spring |
| whole | 2.144 | 6.86 sp | ~2.1 sp | spring |

Column width = `max(rod, idealWidth)`. Column layout, left→right: `[accidentals][notehead][chord-shift][dots]` + 0.3sp minimum inter-column gap — `chord-shift` is the extra width from a shifted chord member (Stems step 4, above: the shifted notehead sits right of the stem, extending the column past `notehead`, not before it).

Dot vertical placement: same y as its notehead if the notehead sits in a space; nudged up `0.5sp` if the notehead sits on a line (a dot never renders directly on a staff line). Rest dots: same rule relative to the rest's y (Rests, below).

Justify per system:

```
natural = Σ columnWidth + fixedWidths(clef, key, time, barlines)
slack   = systemWidth - natural
if slack > 0: stretch_i = max(0, ideal_i - rod_i) + EPS_STRETCH
              x_i += slack * (Σ_{j<i} stretch_j) / (Σ_j stretch_j)
if slack < 0: push the last measure to the next system
```

`EPS_STRETCH` (small constant on every spring) keeps a system of entirely rod-dominated columns from dumping all slack on one column.

**Last system: natural width, not justified** (optional stretch to `maxLastSystemFill`, default 0.65). Full-justifying a 2-measure final system produces the "two notes stranded at opposite ends" look.

**System breaking:** greedy — accumulate measures until the next exceeds `widthSp`, accounting for clef/key restatement cost at each new system. `NormalizedMeasure.systemBreak: true` forces a break — set by `normalize.ts` from MNX `scores[0].pages[].systems[].measure` (a system starting at measure `k` forces a break after `k−1`, mnx.md); no `pages`/`systems` at all falls back to this greedy algorithm entirely. Global (Knuth-Plass) optimization deferred — scores are 1–8 measures, not worth it; stage signature unchanged if added later.

## Key signatures

Sharp order: F C G D A E B. Flat order: reverse. `fifths` selects a prefix of the relevant array — no algorithm, a constant + a slice.

Octave placement (clef-dependent, one irregularity):

| Clef | Sharps | Flats |
| --- | --- | --- |
| Treble | F♯ 0, C♯ 1.5, G♯ −0.5, D♯ 1, A♯ 2.5, E♯ 0.5, B♯ 2 (staff positions from top line, half-spaces) | B♭ 2, E♭ 0.5, A♭ 2.5, D♭ 1, G♭ 3, C♭ 1.5, F♭ 3.5 (bottom space; the 7-flat key only) |
| Bass | treble pattern, shifted 1sp lower | same shift |
| Alto | treble pattern, shifted by topLineStep offset | same |
| Tenor | **irregular**: F♯/C♯ placed an octave down vs. naive derivation (avoids a ledger-line sharp) | regular |

Implementation: treble pattern as canonical array, derive others by `topLineStep` offset, tenor sharps as an explicit override. 15 keys × 4 clefs = 60 cases in `test/key-clef-corpus.test.ts`, asserted against independent staff-position tables.

Key change: emit naturals for accidentals present in the outgoing key and absent in the incoming, before the new key's accidentals.

## Time signatures

`symbol:'common'`/`'cut'` (`TimeSpec`, mnx.md): single glyph, timeSigCommon (E08A) / timeSigCutCommon (E08B), replaces the numerator/denominator stack entirely — no digits drawn.

Numeric (default): digit glyphs (timeSig0–9, E080–E089, `font.md`) compose left-to-right, no kerning table at this size.

```
1. numerator group: `beats` digits, denominator group: `beatType` digits, each glyph's own
   advance width from the font metadata JSON (architecture.md) — summed, not assumed fixed.
2. both groups horizontally centered on the same x (the wider group sets the column's x-center).
3. numerator baseline: top stave-space (y≈1.5sp); denominator baseline: bottom stave-space
   (y≈2.5sp) — each digit glyph is sized to one stave-space, per SMuFL convention.
4. column width (feeds `fixedWidths`, Horizontal spacing below) = max(numerator width,
   denominator width) + fixed padding, same padding convention as clef/key chrome.
```

Mid-score change: restated at the new measure, same barline-adjacent placement as a key change (Key signatures, above); previous signature isn't repeated.

## Accidentals

State: `Map<"step:octave", alter>`, reset per barline, seeded from the key signature (key accidentals are octave-agnostic — separate lookup consulted on miss).

```
for each note in time order:
  written = policy resolution:
    'never' -> none | 'always' -> yes | 'cautionary' -> yes, parenthesized if options.accidentals.parenthesizeCautionary
    'auto'  -> yes iff note.alter != effectiveAlter(step, octave)
  tie-stop whose tie-start carried an accidental in the previous measure -> suppress (no
    repeat across a barline, even though the pitch continues)
  update state[step:octave] = note.alter after emitting
```

`options.accidentals.courtesyPolicy: 'none' | 'next-measure' | 'always'`, default `'next-measure'` — an unexpected accidental is the thing being tested, ambiguity is a bug not a style choice.

**Chord stacking:** sort accidentals top-down by staff position, greedy-pack into columns running leftward from the notehead: the column nearest the notehead is filled first, and each accidental goes into the nearest column where it doesn't vertically overlap (bbox test, ~0.2sp pad) anything already placed — a new column opens further left only when every existing one collides. Feeds the rod width above.

## Ties

- Direction: opposite the stem (single voice); by voice in 2-voice (v0 arches up, v1 down); chord: outer notes arch outward, inner follow the nearest outer.
- Endpoints: ~0.3sp inset from the notehead edge, ~0.5sp vertical offset from centre — never starting at the notehead (reads as a slur).
- Shape: filled path, variable width (tieEndpointThickness 0.10 → tieMidpointThickness 0.22), two cubic Béziers closed into one path — not a stroked constant-width curve.
- Across a barline: continues normally. Across a system break: two half-ties.

## Slurs

Scope: note-to-note, one nesting level.

```
p0/p3 = notehead-edge anchors, offset per direction (stem tip instead of notehead
  when the endpoint's own stem is drawn on that side, so the slur clears the beam)
dir   = MNX slur.side if given; else by voice in 2-voice (v0 -> +1, v1 -> -1);
        else +1 (arch up) if any stem in the span is down, else -1 (arch down)
arch  = clamp(BASE_ARCH + span*ARCH_PER_SP, MIN_ARCH, MAX_ARCH)   ~0.9..3.0 sp
p1 = p0 + (0.25dx, -dir*arch);  p2 = p0 + (0.75dx, -dir*arch)
clearance: sample the curve at ~8 points; if any point is inside an intervening
  notehead/stem/beam bbox, arch += penetration + 0.25sp, resample. cap 4 iterations.
thicken as ties (slurEndpointThickness 0.10 -> slurMidpointThickness 0.22).
```

Across a system break: two half-slurs, same endpoint/direction rules as each half; no
clearance sampling across the break (nothing to sample against) and no diagnostic.

## Rests

Single-voice y: middle-line baseline, `y = 2.0` sp (top-line origin, `architecture.md`), **except** whole/breve, which hangs from the line above (`y = 1.5`) per convention (a rest "hangs," a notehead "sits"). Assumes Bravura's rest glyphs (E4E2–E4E9) are self-anchored to this baseline (standard SMuFL practice, but `font.md`'s glyph table has no measured anchor data for them — confirm against the real glyph metadata in Phase 0/1, `roadmap.md`, before trusting this as a no-table rule). Two-voice offset (v0 up `y=1.0`, v1 down `y=3.0`) is relative to this baseline — see Two voices, below.

`wholeBar: true` on a `NormalizedElement`/`TemporalElement` (from MNX `sequence.fullMeasure`, mnx.md): the measure still gets one column, and `idealWidth(d)` (Horizontal spacing, above) uses its overridden `durationTicks` (the measure's real capacity, mnx.md's "Whole-bar rests" — not the nominal `'whole'` `base`, which would undersize a 9/8 or 5/4 bar). Only the rest glyph's **x-offset within that column** is overridden to the column's horizontal center, rather than derived from its (irrelevant, always-zero) tick offset — the glyph itself is always the single whole-rest shape regardless of meter.

## Ledger lines

For a notehead with `staffPosition` outside `[0, 4]` (above/below the 5-line staff): emit one `RectShape` per **integer** staff-position line strictly between the staff edge and the notehead, plus the notehead's own line if it lands on one — a notehead sitting in a space gets no ledger line for itself, only the ones it passes over. Each line: `legerLineExtension` (0.4sp) past the notehead on both sides, `legerLineThickness` (0.16sp).

## Barlines

Each a `RectShape` (or several, for double/final/repeat) at the measure's right edge (`barlineEnd`, from MNX `global.measures[i].barline`/`repeatEnd`) or left edge (`barlineStart`, from `repeatStart`) — `mnx.md`. `barlineEnd`/`barlineStart` are independent fields on `NormalizedMeasure`, possibly resolved from different source measures (a repeat spans the `repeat-end` of one measure and the `repeat-start` of the next) — listed separately, not as one combined enum.

| Value | Field | Rendered as (left→right) | Thickness |
| --- | --- | --- | --- |
| `single` | `barlineEnd` | one line | `thinBarlineThickness` (0.16sp) |
| `double` | `barlineEnd` | two thin lines | `thinBarlineThickness` each, `barlineSeparation` (0.4sp) apart |
| `dashed` | `barlineEnd` | one line broken into dash segments — several `RectShape`s at one x, same top-line-to-bottom-line span as `single` | `dashedBarlineThickness` (0.16sp), dashes `dashedBarlineDashLength` (0.5sp), gaps `dashedBarlineGapLength` (0.25sp). Dash and gap keep their metadata lengths exactly; the run is centred on the staff height and clipped to it, so the outermost dashes touch the top and bottom lines. Horizontal contribution is a single thin line's — it is broken vertically, not horizontally |
| `final` | `barlineEnd` | thin, then thick — thick line sits at the true measure edge | `thinBarlineThickness` then `thickBarlineThickness` (0.5sp), `barlineSeparation` apart |
| `repeat-end` | `barlineEnd` | two dots, then thin, then thick — thick line at the true measure edge, dots adjacent to the **preceding** (repeated) music | as `final`, plus two `repeatDot` glyphs, `repeatBarlineDotSeparation` (0.16sp) from the thin line, straddling the middle staff line |
| `repeat-start` | `barlineStart` | thick, then thin, then two dots (mirror of `repeat-end`) — thick line at the true measure edge, dots adjacent to the **following** (repeated) music | as `repeat-end`, mirrored |

Contributes to the column rod width (`Horizontal spacing`, above) via `fixedWidths(clef, key, time, barlines)`.

## Breath marks

From MNX `event.markings.breath`/`.caesura` (`mnx.md`), carried as `TemporalElement.breath` — not a sequence-content item of its own: a breath is a performance direction attached to a note's event, so it consumes no time and can never affect the fullness rule. It is drawn immediately after the note it hangs off, before the next element in the voice.

| Value | Glyph | Reads as |
| --- | --- | --- |
| `'comma'` | `breathMarkComma` (E4CE) | the ordinary breath/lift mark |
| `'caesura'` | `caesura` (E4D1) | the "railroad tracks" — a full stop in the flow |

Placement:

- **x**: 0.35sp past the note's right edge — the notehead advance plus any chord second-shift and augmentation dots, the same extent the column's rod already measures. The mark extends the note's `rightWidth`, so the next column moves right by exactly the mark's advance width rather than colliding with it.
- **y**: the top staff line, `y = 0`. Read off the glyph metadata, not assumed: `breathMarkComma` has bBox y 0.008..1.004 and `caesura` -0.004..2.128, so both start at their origin and extend upward only — anchoring on the top line puts all of their ink in the space above the staff, where the convention puts them, and any lower an anchor would drive them through the staff lines.

## Two voices

Exactly 2 per staff — covers everything needed, avoids the 3+-voice collision combinatorics.

- Stem direction decided per measure (per staff): the voice whose notes have the smaller mean `staffPosition` (the higher-pitched voice — `y` increases downward, `staff.md`) gets stems up, the other down; a tie keeps sequence order (`sequences[0]` up). This is computed from real pitches, not sequence order, so a part that lists its lower line first (`multiple-voices.json`) no longer gets crossed stems. An explicit MNX `stemDirection` on the note/beam still wins per event, same as before.
- Rests offset ±1sp vertically (up for the up-stemmed voice, down for the other, per the same per-measure decision) from the single-voice anchor, unless MNX gives `rest.staffPosition`.
- Augmentation dots on a v1 note that lands on a staff line go to the space below, instead of the usual space above.
- Shared tick → shared column, rod = union of both voices' requirements.
- Seconds between voices at a shared tick: shift the v0 (upper, stem-up) notehead one notehead width right.
- Same-tick unison, identical notehead glyph and dot count: no shift — both voices' noteheads sit at the same x, each keeps its own element/hitbox.
- Same-tick unison, different notehead glyphs: shift v1 right by one notehead width instead.
- Accidentals at a shared tick are packed across both voices together so their glyphs can't collide.
- Beaming runs per voice independently, direction pre-forced.

A beam's own stem-reach-the-middle-line rule (Beams, above) is skipped for a beam in a two-voice measure — a voice's beam is expected to sit off to its own side of the staff and never has to cross toward the middle line.

Out of scope: shared-stem merging, opposing-voice accidental interleaving.

## Implementation notes

Rationale that used to live in code comments. The code carries none, so decisions with a non-obvious reason are recorded here.

- **Octave clefs.** An octave clef shifts `topLineStep` by ±7. `Pitch` is the sounding pitch, so an 8vb clef places a pitch an octave lower than the plain clef would; `octaveShift: -1` lowers the reference pitch (`+7 * octaveShift`). The clef glyph's baseline is the line naming its own pitch (treble 3.0, bass 1.0, alto 2.0, tenor 1.0) and does not move with `octaveShift`: the glyph swaps, it does not shift.
- **Key signatures in other clefs.** A signature is the treble pattern plus a per-clef vertical offset. An octave is 7 steps = 3.5 sp, so the offset is only defined modulo 3.5; the representative closest to zero keeps the signature on or near the staff. This reproduces bass +1, alto +0.5, tenor −0.5.
- **Tenor sharps.** The table above says F♯/C♯ go an octave down, but the naive tenor C♯ already sits on the staff at y = 1.0, and moving it down lands it at 4.5, below the bottom line, which is the very thing the rule exists to avoid. The sharps that actually need the octave are the ones the naive derivation puts above the top line: F♯ (−0.5) and G♯ (−1.0, on a ledger line). The code implements the stated intent, giving the conventional tenor signature (F♯ 3.0, C♯ 1.0, G♯ 2.5, D♯ 0.5, A♯ 2.0, E♯ 0.0, B♯ 1.5). `key-clef-corpus.test.ts` pins all 60 key × clef combinations.
- **Seven flats.** The seventh flat (F♭) is at 3.5 in treble (bottom space), not 0.
- **Rest anchors (checked against the Bravura metadata, not the earlier figures).** `restWhole` has bbox y −0.54..0.036, so it hangs below its origin; the origin is the line it hangs from, y = 1.0. `restDoubleWhole` has bbox y 0..1.0, sits above its origin and fills one space, so y = 2.0 puts it in the space above. Every other rest is centred on, or sits on, its origin, so the middle-line baseline y = 2.0 is right. A whole-bar rest always draws the single whole-rest glyph whatever the meter.
- **Breath marks.** They anchor on the top staff line, y = 0. `breathMarkComma` (bbox y 0.008..1.004) and `caesura` (−0.004..2.128) start at their origin and extend upward only, so the ink lands in the space above the staff, where convention puts it. Any lower anchor would drive them through staff lines.
- **Stems.** Below the middle line stems up, above stems down, on it down by convention. A chord votes by the member furthest from the middle line; a chord straddling it symmetrically falls back to down.
- **Accidental stretch.** `justify` places a column's notehead at `xStart + leftWidth` (the accidental block sits before it), but the next column's `xStart` advances only by `width`. If `width` were just the ideal width, an accidental would widen the gap before its own note and steal the same amount from the gap after it, which is backwards. Column width therefore looks ahead to the next column's `leftWidth`, keeping the notehead-to-notehead spring at its full ideal width whichever side's accidental caused the stretch.
- **Stretch capacity.** During `justify` it is duration-proportional only, never reduced by the column's own rod requirement: a rod is a floor on natural width, not a penalty on how much slack a column earns. Using `springWidth − rodWidth` starved accidental-bearing columns of their share and compressed the gap after them unevenly.
- **Dashed barlines** take one line's worth of horizontal space, like `single`; they are broken vertically, not horizontally.
- **Spacing constants without a spec value** (invented, tune against the gallery): accidental gap 0.16, accidental column gap 0.12, stacking pad 0.2, dot gap 0.2, dot spacing 0.1, breath-mark gap 0.35 (all sp).

# Engraving algorithms

## Staff

5 lines per staff, one `RectShape` each, thickness `staffLineThickness` (0.13sp, architecture.md), spanning the system's full justified width — drawn once per staff per system, independent of content.

## Stems

Direction and length for every notehead outside a beam group (stage 5, `vertical` — architecture.md). Beamed notes use the same direction rule; their length is finalized post-justify (`Beaming`, below — stage 9).

```
1. direction: staffPosition < 2.0 (above middle line) -> down; > 2.0 (below middle line) -> up;
   == 2.0 -> down (tie-break, matches Beaming's group rule below). Chord: vote by the member
   furthest from the middle line. `NoteEl.stem` (data-model.md) overrides when set.
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

Only durations < quarter beam. Group-break conditions, per voice, walking onset ticks:

```
break if: element is a rest (unless beamOverRests)
        | duration >= quarter
        | element.beam === 'none'
        | onset crosses a beat-group boundary
        | element.beam === 'begin'
```

Beat-group boundaries. Resolution order for irregular meters: `TimeSpec.beatGrouping` (per-measure, data-model.md) > `options.beaming.beatGrouping` (score-wide default, applied when a measure omits its own) > guessed default below (diagnostic emitted when guessing):

| Meter | Group unit | Boundaries (quarters from bar start) | Note |
| --- | --- | --- | --- |
| 2/4, 3/4 | quarter | 1, 2, (3) | |
| 4/4 | quarter | 1, 2, 3 | `options.beaming.halfBarBeaming` default **on** for 8ths only: beam 4-at-a-time across 1–2 and 3–4, never across the bar middle |
| 2/2, cut | half | 2 | |
| 3/8 | whole bar | — | |
| 6/8, 9/8, 12/8 | dotted quarter | 1.5, 3, (4.5), (6) | groups by the dotted beat, not the eighth |
| 5/8, 7/8, 5/4, 7/4, 11/8… | explicit | from resolved `beatGrouping` (above) | default guess [3,2] / [2,2,3] / [3,2]; emits a diagnostic when guessing |

Geometry, per group, run **after justification** (needs final x):

```
1. stem direction: from Stems (above) — already resolved per-note/per-chord; 2-voice forces it
   instead (skip, see Two voices below).
2. nominal stem ends: same font anchors as Stems (above), extend 3.5sp from notehead centre.
3. raw slope from OUTER note endpoints (not regression — engraving convention anchors the
   outer notes; regression visibly disagrees with the first/last note).
4. constrain:
     all staffPositions equal          -> slope = 0
     non-monotonic, first == last       -> slope = 0   (a "valley"/"peak" group)
     slope = clamp(slope, -0.25, 0.25)  sp/sp
     totalRise = clamp(slope * span, -2.5, 2.5) sp, recompute slope
5. quantize left end to quarter-space grid (yLeft = round(yLeft*4)/4).
6. shift the whole beam so every stem clears MIN_STEM = 3.0sp beamed.
7. emit level-0: RectShape{ x:x0, y:yLeft, w:x1-x0, h:0.5, rot:atan(slope) }.
   level n offset = n * 0.75sp (beamThickness 0.5 + beamSpacing 0.25) toward the noteheads.
8. stems re-terminate at the beam line, not at nominalStem.
```

Secondary beams/hooks, per level L=1 (16th), 2 (32nd), 3 (64th):

```
needsL[i] = beamCount(duration[i]) > L
runs = maximal consecutive runs of needsL within the group
  run length >= 2 -> full beam segment across the run
  run length == 1 -> hook, ~1.0sp, toward the neighbour sharing the L-th subdivision
                      (ambiguous: point right at group start, left at group end)
break level-L beams at the L-th subdivision's beat boundary if the group spans one
```

Out of scope: cross-staff beaming, mixed stem direction within a beam, feathered beams (additive later; the first two need a second staff).

`MAX_SLOPE=0.25`, rise cap `2.5sp` are engraving heuristics (Gould, *Behind Bars*), not measured — tune against the test gallery (`roadmap.md`).

## Tuplets

Single nesting level. `tuplet(actual, normal, ...elements)` (`interface.md`) marks a contiguous run; the `grouping` stage (`architecture.md`) resolves it to a span:

```ts
interface TupletSpan { startTick: number; endTick: number; actual: number; normal: number; elements: readonly NoteId[]; bracket: boolean }
```

Duration scaling (`actual`:`normal`, e.g. 3:2) is applied per-element at the `temporal` stage (`data-model.md`), before grouping ever sees the span. A `tuplet()` call whose span crosses a barline is rejected at `temporal` — diagnostic `tuplet-crosses-barline` — tuplets don't span barlines.

Bracket suppression: **omit the bracket** when every element in the span beams together as one run — the beam already marks the group; draw only the numeral, centered above/below the beam. **Draw the bracket** when the span is unbeamed, only partially beamed, or contains a rest.

Geometry, when drawn (post-justify, same as beams):

```
1. endpoints (x0,yBracket)-(x1,yBracket): yBracket = 1.0sp outside the extreme notehead/stem of
   the span — above if any stem in the span points up, below if down; mixed -> above. Line
   thickness `tupletBracketThickness` (0.16sp, architecture.md).
2. hooks: ~0.5sp vertical ticks at each end, same thickness, pointing toward the notes —
   omitted on whichever end abuts a beam (the beam line already reads as that edge).
3. numeral: `actual` only (e.g. "3", not "3:2") unless `options.tuplets.showRatio` is set,
   centered at the bracket midpoint, 0.3sp gap, tuplet-digit glyphs (E880–E889) + tupletColon
   (E88A). Numeral position/glyphs are the same whether or not the bracket itself is drawn
   (suppression above only affects the bracket line + hooks).
```

Nested/compound tuplets: out of scope (`README.md`).

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

**System breaking:** greedy — accumulate measures until the next exceeds `widthSp`, accounting for clef/key restatement cost at each new system. `Measure.systemBreak: true` forces a break. Global (Knuth-Plass) optimization deferred — scores are 1–8 measures, not worth it; stage signature unchanged if added later.

## Key signatures

Sharp order: F C G D A E B. Flat order: reverse. `fifths` selects a prefix of the relevant array — no algorithm, a constant + a slice.

Octave placement (clef-dependent, one irregularity):

| Clef | Sharps | Flats |
| --- | --- | --- |
| Treble | F♯ 0, C♯ 1.5, G♯ −0.5, D♯ 1, A♯ 2.5, E♯ 0.5, B♯ 2 (staff positions from top line, half-spaces) | B♭ 2, E♭ 0.5, A♭ 2.5, D♭ 1, G♭ 3, C♭ 1.5, F♭ 0 |
| Bass | treble pattern, shifted 1sp lower | same shift |
| Alto | treble pattern, shifted by topLineStep offset | same |
| Tenor | **irregular**: F♯/C♯ placed an octave down vs. naive derivation (avoids a ledger-line sharp) | regular |

Implementation: treble pattern as canonical array, derive others by `topLineStep` offset, tenor sharps as an explicit override. 15 keys × 4 clefs = 60 golden test cases.

Key change: emit naturals for accidentals present in the outgoing key and absent in the incoming, before the new key's accidentals.

## Time signatures

`symbol:'common'`/`'cut'` (`TimeSpec`, data-model.md): single glyph, timeSigCommon (E08A) / timeSigCutCommon (E08B), replaces the numerator/denominator stack entirely — no digits drawn.

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

**Chord stacking:** sort accidentals top-down by staff position, greedy-pack into the leftmost column that doesn't vertically overlap (bbox test, ~0.2sp pad) anything already there. Feeds the rod width above.

## Ties

- Direction: opposite the stem (single voice); by voice in 2-voice (v0 arches up, v1 down); chord: outer notes arch outward, inner follow the nearest outer.
- Endpoints: ~0.3sp inset from the notehead edge, ~0.5sp vertical offset from centre — never starting at the notehead (reads as a slur).
- Shape: filled path, variable width (tieEndpointThickness 0.10 → tieMidpointThickness 0.22), two cubic Béziers closed into one path — not a stroked constant-width curve.
- Across a barline: continues normally. Across a system break: two half-ties.

## Slurs

Scope: note-to-note, single system, one nesting level.

```
p0/p3 = notehead-edge anchors, offset per direction
dir   = +1 (arch up — y decreases, architecture.md) if any stem in the span is down, else -1
        (arch down); voice forces it in 2-voice (v0 -> +1, v1 -> -1)
arch  = clamp(BASE_ARCH + span*ARCH_PER_SP, MIN_ARCH, MAX_ARCH)   ~0.9..3.0 sp
p1 = p0 + (0.25dx, -dir*arch);  p2 = p0 + (0.75dx, -dir*arch)
clearance: sample the curve at ~8 points; if any point is inside an intervening
  notehead/stem/beam bbox, arch += penetration + 0.25sp, resample. cap 4 iterations.
thicken as ties (slurEndpointThickness 0.10 -> slurMidpointThickness 0.22).
```

Out of scope: cross-system slurs (system breaks avoid splitting a slur in the common case).

## Rests

Single-voice y: middle-line baseline, `y = 2.0` sp (top-line origin, `architecture.md`), **except** whole/breve, which hangs from the line above (`y = 1.5`) per convention (a rest "hangs," a notehead "sits"). Assumes Bravura's rest glyphs (E4E2–E4E9) are self-anchored to this baseline (standard SMuFL practice, but `font.md`'s glyph table has no measured anchor data for them — confirm against the real glyph metadata in Phase 0/1, `roadmap.md`, before trusting this as a no-table rule). Two-voice offset (v0 up `y=1.0`, v1 down `y=3.0`) is relative to this baseline — see Two voices, below.

`RestEl.wholeBar: true` (data-model.md): the measure still gets one column, and `idealWidth(d)` (Horizontal spacing, above) uses its overridden `durationTicks` (the measure's real capacity, data-model.md's "Whole-bar rests" — not the nominal `'whole'` `Duration` base, which would undersize a 9/8 or 5/4 bar). Only the rest glyph's **x-offset within that column** is overridden to the column's horizontal center, rather than derived from its (irrelevant, always-zero) tick offset — the glyph itself is always the single whole-rest shape regardless of meter.

## Ledger lines

For a notehead with `staffPosition` outside `[0, 4]` (above/below the 5-line staff): emit one `RectShape` per **integer** staff-position line strictly between the staff edge and the notehead, plus the notehead's own line if it lands on one — a notehead sitting in a space gets no ledger line for itself, only the ones it passes over. Each line: `legerLineExtension` (0.4sp) past the notehead on both sides, `legerLineThickness` (0.16sp).

## Barlines

Each a `RectShape` (or several, for double/final/repeat) at the measure's right edge (`barlineEnd`) or left edge (`barlineStart`) — `data-model.md`. `barlineEnd`/`barlineStart` are independent fields, possibly on different measures (a repeat spans the `repeat-end` of one measure and the `repeat-start` of the next) — listed separately, not as one combined enum.

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

`NoteEl.breath` (`data-model.md`), not a `VoiceElement`: a breath is a performance direction attached to a note, so it consumes no time and can never affect the fullness rule. It is drawn immediately after the note it hangs off, before the next element in the voice.

| Value | Glyph | Reads as |
| --- | --- | --- |
| `'comma'` | `breathMarkComma` (E4CE) | the ordinary breath/lift mark |
| `'caesura'` | `caesura` (E4D1) | the "railroad tracks" — a full stop in the flow |

Placement:

- **x**: 0.35sp past the note's right edge — the notehead advance plus any chord second-shift and augmentation dots, the same extent the column's rod already measures. The mark extends the note's `rightWidth`, so the next column moves right by exactly the mark's advance width rather than colliding with it.
- **y**: the top staff line, `y = 0`. Read off the glyph metadata, not assumed: `breathMarkComma` has bBox y 0.008..1.004 and `caesura` -0.004..2.128, so both start at their origin and extend upward only — anchoring on the top line puts all of their ink in the space above the staff, where the convention puts them, and any lower an anchor would drive them through the staff lines.

## Two voices

Exactly 2 per staff — covers everything needed, avoids the 3+-voice collision combinatorics.

- Stem direction forced by voice: v0 up, v1 down. No per-note exception.
- Rests offset ±1sp vertically (v0 up, v1 down) so simultaneous rests don't overlap.
- Shared tick → shared column, rod = union of both voices' requirements.
- Seconds between voices: horizontal offset by one notehead width. True unisons: one notehead, two stems.
- Beaming runs per voice independently, direction pre-forced.

Out of scope: shared-stem merging, opposing-voice accidental interleaving.

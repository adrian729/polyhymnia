# Spike: `mnxconverter` for our MusicXML subset

Converter: npm `mnxconverter@1.2.0` ([deemaagog/mnxconverter-ts](https://github.com/deemaagog/mnxconverter-ts), MIT), the latest release on npm (`1.0.0`, `1.0.1`, `1.1.0`, `1.2.0`). Its README says it targets the schema as of 2026-08-12; our pin is `w3c-cg/mnx@25b7d367` (2026-09-24, schema `$id` version 40, `mnx.version` 1) — see `packages/notation-model/schema/SOURCE`. No renamed-key mismatches showed up against our pin in this subset (in particular the 2026-09-22 orientation-key rename didn't touch anything the converter emits for single-staff, single-part content); every file that converted also validated against our schema.

Corpus: `w3c-cg/musicxmlTestSuite` (MIT), cloned to the scratchpad (not committed to the repo). No real MuseScore/Dorico/Sibelius exercise exports were available for this spike — only the official test-suite files were run. This should be revisited with real exercise content once some exists.

## Packaging bugs found and patched

`mnxconverter@1.2.0`'s published `package.json` is broken in two ways, independent of the schema question:

1. `main`/`exports` point at `./lib/esm/index.js` and `./lib/cjs/index.js`, but the actual compiled entry points are one level deeper, at `./lib/esm/src/index.js` and `./lib/cjs/src/index.js`. Importing the package as published fails with `ERR_MODULE_NOT_FOUND`.
2. The `lib/esm` build itself is invalid ESM: its relative imports (e.g. `import { ... } from './score'`) have no `.js` extension, which Node's native ESM resolver requires. It only works today because `lib/cjs` (proper `require(...)` calls, extension-optional) is reachable through the `require` condition — nothing reachable through `import` actually runs.

Fixed with a `pnpm patch` (`patches/mnxconverter@1.2.0.patch`, tracked in `pnpm-workspace.yaml`'s `patchedDependencies`): both the `import` and `require` conditions, `main`, and `types` now point at the working `lib/cjs/src/index.js` (and its `.d.ts`). This is a packaging fix only — no converter logic changed — and it's transparent to `src/convert.ts`, which imports `mnxconverter` normally. Worth reporting upstream, not done as part of this spike.

## Results

25 files selected from the test suite for our supported subset (single staff; clefs incl. octave; key/time signatures incl. common/cut; notes/chords/rests incl. whole-measure/multi-measure rests; dots; accidentals incl. cautionary/parenthesized; ties; tuplets; barlines incl. repeats/endings/dashed; markings; tempo) plus a few adjacent edge cases (complex/additive time signatures, nested tuplets, deliberately overfull measures) to see how they degrade.

| File | Converts | Schema-valid | Renders clean | Diagnostics | Notes |
| --- | --- | --- | --- | --- | --- |
| 01a-Pitches-Pitches | yes | yes | yes | 0 | |
| 01e-Pitches-ParenthesizedAccidentals | yes | yes | yes | 0 | cautionary/parenthesized accidentals round-trip |
| 02a-Rests-Durations | yes | yes | no | 10 | `mnx-unsupported`: 128th/256th/512th/1024th note values (outside our `breve..64th` range, `notation/mnx.md`) — events skipped, exactly as documented |
| 02c-Rests-MultiMeasureRests | yes | yes | yes | 0 | converter emits ordinary whole-measure rests here, not an MNX multimeasure-rest construct — so this one is fine even though multimeasure rests are on the converter's own "not yet" list |
| 03a-Rhythm-Durations | no | n/a | no | — | converter throws `<type> got unsupported value "maxima"` — `maxima` is above `breve`, outside our subset anyway |
| 03d-Rhythm-DottedDurations-Factors | no | n/a | no | — | converter throws `Invalid duration fraction 0.75` on a `<measure-style><multiple-rest>` — matches the converter's own README ("Multi-measure / full-measure rests: Not yet"); outside our subset |
| 11a-TimeSignatures | yes | yes | yes | 0 | |
| 11c-TimeSignatures-Complex | yes | yes | no | 2 | `measure-overfull` — file uses additive time signatures (`3+2`/8, `5+3+1`/4), which MusicXML supports but our schema/engine only take a single `{count, unit}`; outside our subset, not a converter bug |
| 11f-TimeSignatures-SymbolMeaning | yes | yes | no | 1 | one `measure-overfull` on a `senza-misura`-adjacent case; same additive/non-conventional-signature family as above |
| 12a-Clefs | no | n/a | no | — | converter throws `Invalid clef in part P1` on a bare `<clef><sign>percussion</sign></clef>` (no `<line>`); percussion clefs are already out of our subset (`notation/mnx.md` "Unsupported MNX") — a real converter gap, but not one we need |
| 13a-KeySignatures | yes | yes | yes | 0 | |
| 21a-Chord-Basic | yes | yes | yes | 0 | |
| 21b-Chords-TwoNotes | yes | yes | yes | 0 | |
| 21e-Chords-PickupMeasures | yes | yes | yes | 1 | `measure-underfull` warning only (padded); not a failure |
| 23a-Tuplets | yes | yes | yes | 0 | |
| 23d-Tuplets-Nested | no | n/a | no | — | converter throws `Could not fold items` on nested tuplets; our engine can flatten nested tuplets, but the converter can't produce output for them at all — genuine converter gap, low priority (nested tuplets are rare in single-staff exercise content) |
| 31c-MetronomeMarks | yes | yes | yes | 0 | tempo maps correctly |
| 32a-Notations | yes | yes | no | 16 | all `mnx-unsupported` articulation/marking diagnostics (accent, staccato, tenuto, tremolo marking, etc.) — articulations were never in our subset; breath marks in the same file produced no diagnostic at all, i.e. mapped cleanly |
| 33b-Spanners-Tie | yes | yes | yes | 0 | |
| 33k-Tie-Types | yes | yes | yes | 2 | one `measure-underfull` (padded) and one `voice-1-not-yet-supported` (documented, engine-level limitation, not this pipeline's problem) |
| 45a-SimpleRepeat | yes | yes | no | 1 | `mnx-unsupported`: "repeat played 5 times" — our engine only draws a plain end-repeat for `times !== 2`, documented behavior |
| 45b-RepeatWithAlternatives | yes | yes | no | 2 | `mnx-unsupported`: endings — never in our subset (`notation/mnx.md`) |
| 46a-Barlines | yes | yes | yes | 0 | double/final/dashed barlines all map cleanly |
| 46d-PickupMeasure-ImplicitMeasures | yes | yes | yes | 3 | three `measure-underfull` warnings (padded) on implicit incomplete measures beyond the opening pickup — this is what the file is testing, not a bug |
| 46i-OverfullMeasures | yes | yes | no | 2 | `measure-overfull` (error) — file is deliberately overfull; this is `check.ts`/the engine correctly rejecting bad content, exactly the intended behavior |

**Numbers**: 25 files tried, 21 converted (84%), 21/21 of those schema-valid (100%), 15/25 rendered clean with zero diagnostics (60% of all files tried, 71% of converted ones).

## Conclusions

- Within our declared subset, `mnxconverter@1.2.0` is usable as-is: every failure above is either (a) a construct we've already decided is out of scope (percussion clefs, additive/complex time signatures, articulations, multi-measure rests, nested tuplets, `maxima` note values, non-2x repeat counts, endings), or (b) our own pipeline correctly rejecting deliberately-invalid test content (46i). No systematic issue inside the subset showed up, so **no `fixups.ts` was written** — there was nothing in-subset to fix.
- The one thing actually fixed is packaging, not conversion logic: the `pnpm patch` above. Without it the converter can't be imported at all from this ESM workspace.
- The engine now auto-beams and draws tuplet brackets, so `beams` was removed from `check.ts`'s `UNSUPPORTED_ALLOWLIST` (now empty). Re-running this batch against the current engine confirms no diagnostic counts changed: the converter's own README still says part-measure beam encoding is "TODO" on its side, so no file in this batch emits an MNX `beams` construct either way — auto-beaming and tuplet brackets are drawn from note durations and `type: "tuplet"` events regardless, with no allowlist entry needed for either.
- Recommendation: keep the dependency and the pin. Revisit if real MuseScore/Dorico exports (not yet available) show different failure patterns, or if the converter's schema target drifts further from ours.

## Test-suite attribution

A handful of files from `w3c-cg/musicxmlTestSuite` (MIT) are copied into `test/fixtures/` for the vitest suite; see that directory's own note.

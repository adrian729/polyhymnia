# Testing, roadmap, open questions

## Testing

Integration only — no isolated-function unit tests. Every test enters through a real API boundary (`layoutScore()` on a full MNX document, or the rendered `<Notation>` component), never a single internal function in isolation.

- **Schema test** (`notation-engine/test/schema.test.ts`, in place): every fixture under `notation-engine/test/fixtures/` — one hand-written MNX document per golden-file case — validates against the pinned `mnx-schema.json` with Ajv, so a fixture can't silently drift into something the real schema would reject.
- **Conformance test** (`notation-engine/test/conformance.test.ts`, in place): runs all 52 vendored official MNX examples (`notation-model/schema/examples/`) through `layoutScore()`. Every one must lay out without throwing; each is asserted against an exact expected diagnostic-code list — this is what actually proves `mnx.md`'s mapping table stays true as the pipeline changes, more than the table itself does.
- **MNX↔engine mapping test** (`notation-engine/test/mnx-mapping.test.ts`, in place): targeted cases for individual mapping rules — clef resolution, tie resolution, tuplet ratios, barline types, pickup detection, and so on.
- **Golden-file (primary, output geometry):** full pipeline, MNX fixture → `LayoutResult`, snapshot the result (3-decimal rounded), not SVG strings — an SVG diff fires on attribute-order noise, a `LayoutResult` diff only on real geometry moves and shows what moved. Corpus, one MNX fixture each (~25 items, doubles as the dev gallery): scale in treble/bass, all 15 keys × 4 clefs (60 combinations — batched as one parameterized fixture, catches the tenor octave-placement irregularity), 4-note chord w/ 3 accidentals + cautionary/courtesy cases, ledger lines ±4, straight 8ths (beaming), 16ths (secondary beams), mixed 16-8-16 (hooks), 6/8 vs 3/4 (same total duration, different beat grouping), triplets beamed/unbeamed, beam-slope edge cases (flat/clamped), tie across a barline, tie across a system break, slur over a leap, 2 voices with a second, whole-bar rest in 3/4, whole-bar rest in 9/8 (unrepresentable-capacity case, mnx.md), dotted note on a line, mid-score clef/meter change, 8-measure line break, pickup measure.
- **Property (fast-check):** same entry point (`layoutScore()` on generated full MNX documents), invariants over the whole output: column x strictly increasing per system; no hitbox overlap within a voice; `Σ durations == capacity` per measure (or a diagnostic); `hitTest(centerOf(box)) === box` round-trip for every element; slot x-bands tile with no gap/overlap.
- **Rendering (RTL):** the real `<Notation>` component, real DOM — one `<g>` per note, `aria-label` correctness, click → expected intent, `activeIds` → `data-pn-playing`.
- **Dev gallery route:** full golden-file corpus, multiple sizes, both themes — where engraving mistakes get caught, by eye.
- **Dev-only side-by-side vs. abcjs** (dev dependency, never shipped): same corpus through both, visual reference not assertion — catches "this looks subtly wrong" that no automated test surfaces.
- **Deferred:** Playwright screenshot diffing — add once output stabilizes (Phase 5); earlier, it fails on every intentional change.

## Roadmap

| Phase | Scope | Done when | Est. |
| --- | --- | --- | --- |
| 0 — Skeleton | Workspace split, DOM-excluded model/engine tsconfigs, font build script (subset → rename → metadata filter). `<Staff>` renders 5 lines + clef at fixed position. | Compiles; fails on any `document` reference in `notation-model` or `notation-engine`. | 1 day |
| 1 — Pitch + click-to-insert | Data model, `Rational`, single measure/voice, noteheads/accidentals/ledger/stems/flags/rests/dots. Fixed-width spacing (no justify yet). `hitTest` + slots + `insertNote`. Golden-file tests. | Reveal any 1–4 note chord/interval; click an empty staff to add a note. | 3–4 days |
| 2 — Real scores | Key/time signatures, barlines, multi-measure, spring/rod spacing + justify, greedy breaking. Timemap export, `mode:'notes'`. | 8-measure melody in any key lays out and highlights note-by-note against the audio engine. | 4–5 days |
| 3 — Rhythm | Beat grouping, beam geometry + secondaries + hooks, single-level tuplets, `mode:'cursor'` (WAAPI + rAF, deferred). | Rhythmic dictation displays. | 4–5 days |
| 4 — Polish | Ties (barline + system-break), slurs, cautionary accidentals, 2 voices, mid-score clef/key/meter changes, accidental stacking. | Full test corpus renders correctly, both themes, 3 sizes. | 4–5 days |
| 5 — Extraction-ready | Public surfaces + README, `sideEffects:false`, exported CSS theme, `applyIntent` + inverse, `npm pack` smoke test into a throwaway app, Playwright visual baseline. | `npm pack` → install into an empty app → renders. | 2 days |

~4 weeks total, useful at end of week 1. Phases 2/3 are independent, parallelizable.

**Not on the roadmap** (deferred features, `README.md`): grand staff, cross-staff beaming, nested tuplets, grace notes, dynamics, articulations, lyrics, chord symbols, multi-page.

## Per-feature LOC estimate (model + engine + react, excl. tests)

| Feature | LOC | Subtlety |
| --- | --- | --- |
| Staff, clefs, pitch→y, ledger lines | 120 | low |
| Noteheads, stems, flags, dots, rests | 200 | low |
| Key signatures (all 15) | 60 | low |
| Accidental state + cautionary logic | 120 | medium |
| Accidental stacking in chords | 90 | medium |
| Time signatures, barlines | 60 | low |
| Beat grouping for beams | 100 | medium |
| Beam geometry (slope, secondaries, hooks) | 320 | high |
| Tuplets (bracket + numeral, incl. beam-suppression rule) | 150 | medium |
| Horizontal spacing + justification | 180 | medium |
| System (line) breaking | 80 | low |
| Ties | 90 | medium |
| Slurs | 130 | medium-high |
| Two-voice layout | 120 | medium |
| Hit testing + slot model | 150 | medium |
| Timemap | 90 | low |
| React layer | 250 | low |
| **Total** | **≈2,310** | 3–4 focused weeks |

## Open questions

- **Grand staff** (deferred, `README.md`): most likely deferral to bite. MNX already represents it — a part's `staves` count > 1 (`mnx.md`'s "Unsupported MNX" already reads and rejects this field) — so no schema change is needed, but the layout pass needs a vertical-system concept and a brace glyph it doesn't have. **Check the exercise catalogue against this before Phase 2.**
- **OFL rename obligation** (`font.md`): our reading of OFL-FAQ 2.6, not legal advice. Google Fonts serves subsets under original names — live interpretive gap in the ecosystem. Get qualified review if it matters commercially.
- **`divisions = 3360`** (`mnx.md`): chosen for exact 5-/7-tuplet-of-64th representation. 960 is more MIDI/MusicXML-conventional if 5-/7-tuplets never happen. Cheap to change now, expensive once real data is serialized.
- **Tempo in the MNX document** (`playback.md`) assumes notation owns timing. If a user-adjustable practice-tempo slider shouldn't re-render the score, move `TempoMap` to a separate argument on `tickToSeconds` instead.
- **WAAPI transform on SVG `<g>` in Safari** (`playback.md`): should work, needs a five-minute smoke test if the cursor is revived.
- **Is `mode:'cursor'` needed for MVP?** Deferred — `mode:'notes'` highlighting covers the current exercises; revisit later.
- **`options.accidentals.insertAlteration` default = key-aware** (`interaction.md`): F line in D major → F♯. Alternative: always-natural + a separate chromatic-alter action (more predictable, more clicks). UX call, not architecture.
- **Rest-glyph vertical anchor** (`engraving.md`): assumed self-anchored to one y per duration; confirm against Bravura's actual glyph metadata in Phase 0/1 — if false, needs a per-duration offset table.
- **4/4 half-bar beam default (`options.beaming.halfBarBeaming`) = on** (`engraving.md`): standard engraving, arguably worse for beat-recognition pedagogy (strict per-beat beaming reads the meter more clearly). The option exists either way — revisit against the actual rhythm exercises.
- **Spacing/beam constants** (K=0.55, BASE=3.2sp, MAX_SLOPE=0.25, rise-cap=2.5sp) are engraving-practice defaults, not measured against this app's output. Tune against the gallery in Phase 2.
- **No comparison to abcjs/VexFlow output quality exists yet.** The Phase-3 side-by-side harness (Testing, above) is specifically to find out early, while there's still time to reconsider.

# Testing, roadmap, open questions

## Testing

Integration only — no isolated-function unit tests. Every test enters through a real API boundary (`layoutScore()` on a full `ScoreDoc`, or the rendered `<Notation>` component), never a single internal function in isolation.

- **Golden-file (primary):** full pipeline, `ScoreDoc` → `LayoutResult`, snapshot the result (3-decimal rounded), not SVG strings — an SVG diff fires on attribute-order noise, a `LayoutResult` diff only on real geometry moves and shows what moved. Corpus, one `ScoreDoc` fixture each (~25 items, doubles as the dev gallery): scale in treble/bass, all 15 keys × 4 clefs (60 combinations — batched as one parameterized fixture, catches the tenor octave-placement irregularity), 4-note chord w/ 3 accidentals + cautionary/courtesy cases, ledger lines ±4, straight 8ths (beaming), 16ths (secondary beams), mixed 16-8-16 (hooks), 6/8 vs 3/4 (same total duration, different beat grouping), triplets beamed/unbeamed, beam-slope edge cases (flat/clamped), tie across a barline, tie across a system break, slur over a leap, 2 voices with a second, whole-bar rest in 3/4, whole-bar rest in 9/8 (unrepresentable-capacity case, data-model.md), dotted note on a line, mid-score clef/meter change, 8-measure line break, pickup measure.
- **Property (fast-check):** same entry point (`layoutScore()` on generated full `ScoreDoc`s), invariants over the whole output: column x strictly increasing per system; no hitbox overlap within a voice; `Σ durations == capacity` per measure (or a diagnostic); `hitTest(centerOf(box)) === box` round-trip for every element; slot x-bands tile with no gap/overlap.
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
| 3 — Rhythm | Beat grouping, beam geometry + secondaries + hooks, single-level tuplets, `mode:'cursor'` (WAAPI + rAF). | Rhythmic dictation displays; cursor tracks playback without drift. | 4–5 days |
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

- **Grand staff** (deferred, `README.md`): most likely deferral to bite. Data model already has `staves: Staff[]` so no type change is needed, but the layout pass needs a vertical-system concept and a brace glyph it doesn't have. **Check the exercise catalogue against this before Phase 2.**
- **OFL rename obligation** (`font.md`): our reading of OFL-FAQ 2.6, not legal advice. Google Fonts serves subsets under original names — live interpretive gap in the ecosystem. Get qualified review if it matters commercially.
- **`divisions = 3360`** (`data-model.md`): chosen for exact 5-/7-tuplet-of-64th representation. 960 is more MIDI/MusicXML-conventional if 5-/7-tuplets never happen. Cheap to change now, expensive once real data is serialized.
- **Tempo in `ScoreDoc`** (`playback.md`) assumes notation owns timing. If a user-adjustable practice-tempo slider shouldn't re-render the score, move `TempoMap` to a separate argument on `tickToSeconds` instead.
- **WAAPI transform on SVG `<g>` in Safari** (`playback.md`): should work, needs a five-minute smoke test in Phase 3. The rAF path is a complete fallback — a performance question, not a correctness risk.
- **Is `mode:'cursor'` needed for MVP?** If every exercise is discrete (play 4 notes, highlight each as it sounds), `mode:'notes'` alone suffices and the whole WAAPI/cursor machinery slips to Phase 4+. The timemap is needed either way — largest chunk of Phase 3 after beaming, confirm before committing to it.
- **`options.accidentals.insertAlteration` default = key-aware** (`interaction.md`): F line in D major → F♯. Alternative: always-natural + a separate chromatic-alter action (more predictable, more clicks). UX call, not architecture.
- **Rest-glyph vertical anchor** (`engraving.md`): assumed self-anchored to one y per duration; confirm against Bravura's actual glyph metadata in Phase 0/1 — if false, needs a per-duration offset table.
- **4/4 half-bar beam default (`options.beaming.halfBarBeaming`) = on** (`engraving.md`): standard engraving, arguably worse for beat-recognition pedagogy (strict per-beat beaming reads the meter more clearly). The option exists either way — revisit against the actual rhythm exercises.
- **Spacing/beam constants** (K=0.55, BASE=3.2sp, MAX_SLOPE=0.25, rise-cap=2.5sp) are engraving-practice defaults, not measured against this app's output. Tune against the gallery in Phase 2.
- **No comparison to abcjs/VexFlow output quality exists yet.** The Phase-3 side-by-side harness (Testing, above) is specifically to find out early, while there's still time to reconsider.

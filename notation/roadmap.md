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
| 1 — Answer-entry primitives — **done** | Data model, `Rational`, single measure/voice, noteheads/accidentals/ledger/stems/flags/rests/dots. Fixed-width spacing (no justify yet). Rescoped from click-to-insert to exercise primitives (`AGENTS.md`, `interaction.md`): `hitTest` + slots + `applyIntent({type:'setPitches'})`, targeting ear-training answer entry, not a sheet editor. Golden-file tests. | Reveal any 1–4 note chord/interval; resolve a slot/element hit and answer a dictation exercise. | 3–4 days |
| 2 — Real scores | Key/time signatures, barlines, multi-measure, spring/rod spacing + justify, greedy breaking. Timemap export, `mode:'notes'`. | 8-measure melody in any key lays out and highlights note-by-note against the audio engine. | 4–5 days |
| 3 — Rhythm | Beat grouping, beam geometry + secondaries + hooks, single-level tuplets, `mode:'cursor'` (WAAPI + rAF, deferred — see "Deferred / TODO"). | Rhythmic dictation displays. | 4–5 days |
| 4 — Polish — **mostly done** | Ties (barline + system-break) — done, slurs — done, cautionary accidentals — done, 2 voices — done, accidental stacking — done. Mid-score clef changes (E4: font glyphs done, layout pending) and end-of-system courtesy clef/key/time (E5) not done yet — see "Deferred / TODO". | Full test corpus renders correctly, both themes, 3 sizes. | 4–5 days |
| 5 — Extraction-ready | Public surfaces + README, `sideEffects:false`, exported CSS theme. `applyIntent` done (`setPitches`); undo deferred — a generic history of doc states + group fences + selection restore, not per-intent inverses (see "Deferred / TODO"). `npm pack` smoke test into a throwaway app, Playwright visual baseline. | `npm pack` → install into an empty app → renders. | 2 days |

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

## Resolved decisions

- **Grand staff**: deferred. No current exercise needs it; needed for cadence/SATB/bass-line dictation and wide piano voicings. MNX already represents it — a part's `staves` count > 1 (`mnx.md`'s "Unsupported MNX" already reads and rejects this field) — so no schema change is needed, engine-only cost (a vertical-system concept and a brace glyph it doesn't have).
- **`divisions = 3360`**: kept. MNX expresses any tuplet exactly; the value is an internal-only unit, not serialized, so it stays cheap to revisit.
- **Tempo**: MNX tempos are the default source of truth; `tickToSeconds(tick, tempo?)`/`secondsToTick(seconds, tempo?)` take an optional override argument instead of a separate clock — notation packages never run clocks/timers/rAF, the app owns time and passes position (`AGENTS.md`).
- **`options.accidentals.insertAlteration` default = key-aware**: kept. F line in D major → F♯.
- **`options.beaming.halfBarBeaming` default = on**: kept, per-exercise option.

## Open questions

- **OFL rename obligation** (`font.md`): our reading of OFL-FAQ 2.6, not legal advice. Google Fonts serves subsets under original names — live interpretive gap in the ecosystem. Get qualified review if it matters commercially.
- **WAAPI transform on SVG `<g>` in Safari** (`playback.md`): should work, needs a five-minute smoke test if the cursor mode is revived (see "Deferred / TODO").
- **Rest-glyph vertical anchor** (`engraving.md`): assumed self-anchored to one y per duration; confirm against Bravura's actual glyph metadata — if false, needs a per-duration offset table.
- **Spacing/beam constants** (K=0.55, BASE=3.2sp, MAX_SLOPE=0.25, rise-cap=2.5sp) are engraving-practice defaults, not measured against this app's output. Tune against the gallery.
- **No comparison to abcjs/VexFlow output quality exists yet.** The side-by-side harness (Testing, above) is specifically to find out early, while there's still time to reconsider.
- **Tie/slur arch heuristic constants** (`layout/curves.ts`): invented, not measured — confirm against engraving references.
- **Middle note of a 3-note chord ties upward** (`layout/curves.ts`): convention would curve by position relative to the middle line instead; minor, unconfirmed.

## Deferred / TODO

- **Cursor playback mode** (`mode:'cursor'`, `playback.md`): code stays in place; if revived, it must stay position-driven (no clock of its own) and needs a Safari WAAPI smoke test before shipping.
- **Undo history**: deferred. Needs a generic history of doc states + group fences + selection restore, not per-intent inverses.
- **`setRhythm` intent**: not planned. Rhythm-dictation apps rebuild MNX themselves using `point.tick` (`interaction.md`) rather than editing rhythm in place.
- **Editor features**: drag-to-change-pitch, an on-canvas duration palette, free multi-voice entry, measure/meter/key/clef edits, copy/paste — out of scope, interaction targets ear-training exercises, not a sheet editor (`interaction.md` "Deferred editor features").
- **Runtime MusicXML import/export**: import stays offline/build-time only (`tools/musicxml-to-mnx` → committed `.mnx.json`); no runtime import or export until a product flow needs it (`AGENTS.md`).
- **Grand staff + cross-staff beaming**: deferred, depends on grand staff landing first (see "Resolved decisions").
- **One-line percussion staff**: deferred, no current exercise needs it.
- **E4 (mid-score clef changes) + E5 (end-of-system courtesy clef/key/time)**: pending. Font glyphs for E4 (`gClefChange`/`cClefChange`/`fClefChange`, `font.md`) exist; layout doesn't use them yet.
- **Golden fixture for accidental stacking**: tests exist, fixture missing.

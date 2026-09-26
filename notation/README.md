# Notation renderer

Status: accepted design, in progress. Supersedes `RESEARCH.md` §4.8.

Files:

- `interface.md` — public React API: components, props, composition, content authoring. Read first if consuming the library.
- `mnx.md` — the supported MNX subset, the MNX→engine mapping table, unsupported-construct degrade, IDs, time representation, pickup/fullness rules, diagnostics, the pinned schema and its update process.
- `font.md` — SMuFL font choice, glyph set, license, subsetting.
- `architecture.md` — package structure, layout pipeline, coordinate system.
- `engraving.md` — staff, stems, beaming, tuplets, spacing/justification, key/time signatures, accidentals, ties, slurs, rests, ledger lines, barlines, two-voice layout.
- `interaction.md` — hit-testing, click-to-edit, the intent system, edit application.
- `playback.md` — timemap, tempo, playback-position API, cursor rendering.
- `roadmap.md` — testing strategy, phased build plan, LOC estimate, open questions.
- `out-of-scope.md` — symbols/features deliberately not covered: what's blocked on infrastructure that doesn't exist yet vs. what's outside an ear-training app's domain entirely.

## Feature scope

In scope — full engraving, not a reduced subset:

| Feature | Detail | Status |
| --- | --- | --- |
| Clefs | Treble, bass, alto, tenor; octave variants; mid-score changes | Mid-score change: font glyphs done, layout pending (E4, `roadmap.md`); rest done |
| Key signatures | All 15, correct ordering/octave placement per clef, naturals on change | Done |
| Time signatures | Any n/d, common/cut, mid-score changes | Done |
| Durations | Breve–64th, 0–2 augmentation dots | Done |
| Rests | Same range, whole-bar centring, correct hang/sit position | Done |
| Accidentals | ♭♮♯𝄫𝄪, measure-scoped state, cautionary/courtesy, chord stacking | Done |
| Ledger lines | Above/below both staves | Done |
| Stems & flags | Direction/length rules, 8th–64th flags | Done |
| Beaming | Automatic: beat grouping, slope, secondary beams, hooks, breaking | Done |
| Tuplets | Single-level, bracket + numeral | Done |
| Barlines | Single/double/dashed/final/repeat | Done |
| Breath marks | Comma and caesura, attached to a note | Done |
| Ties | Within/across barline, chord-wise | Done |
| Slurs | Single-system, note-to-note | Done |
| Spacing/justification | Duration-proportional, system-width justified | Done |
| Multi-measure | Any count, greedy system breaking | Done |
| Multi-voice | 2 voices per staff | Done |
| Interaction | Hit-testing, slots, `applyIntent({type:'setPitches'})` — ear-training answer entry, not a sheet editor (editor features deferred, `interaction.md`) | Done for exercise use |
| Playback position | Discrete highlight (`mode:'notes'`) + exported timemap; continuous cursor (`mode:'cursor'`) deferred | Discrete done; cursor deferred |
| Accessibility | aria-label per note, text alternative | Done |
| Theming | CSS custom properties | Done |

Deferred — explicit, not accidental. Most are additive later, not a redesign, given the package split already in place and MNX already representing most of them in the schema — except where a row's cost says otherwise:

| Deferred | Cost to add later |
| --- | --- |
| Grand staff / piano brace | **Deferred** — no current exercise needs it; needed for cadence/SATB/bass-line dictation and wide piano voicings if those exercises land. MNX already represents it (a part's `staves` count), so this is an engine-only cost: a vertical-system concept and a brace glyph, no schema change |
| Cross-staff beaming | High — needs grand staff first |
| Nested/compound tuplets | Medium — no longer a schema/data-model change: MNX `tuplet` containers already nest natively (`engraving.md`), the engine just flattens them today (`mnx.md`). Purely an engine change: draw the nested brackets instead of combining the ratio |
| Grace notes, ornaments, glissandi | Medium — needs a new "non-metrical attachment" concept |
| Dynamics, articulations, pedal | Low-medium — glyphs already in the font subset headroom tier (`font.md`) |
| Hairpins | Low — drawn shapes (like ties/slurs), not a glyph; no font cost either way |
| Lyrics, chord symbols, rehearsal marks | Low, but a new (text) layer |
| Full percussion notation | Medium |
| Multi-measure rests, repeats/voltas/jumps | Low |
| Cross-system slurs | Medium |
| Microtonal accidentals, figured bass, tablature | Low — glyphs exist, out of domain; microtonal is also engine-only now: MNX's `pitch.alter` is an unconstrained `number` already, so only the engine's own `Alter` union (`-2\|-1\|0\|1\|2`, `layout/records.ts`) and its clamping in `normalize.ts` would need to widen — no MNX schema change |
| RTL/vertical/mensural notation | n/a |
| Page layout (titles, margins, pagination) | Low — component renders a fragment, host owns the page |

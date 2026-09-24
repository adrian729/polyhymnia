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

| Feature | Detail |
| --- | --- |
| Clefs | Treble, bass, alto, tenor; octave variants; mid-score changes |
| Key signatures | All 15, correct ordering/octave placement per clef, naturals on change |
| Time signatures | Any n/d, common/cut, mid-score changes |
| Durations | Breve–64th, 0–2 augmentation dots |
| Rests | Same range, whole-bar centring, correct hang/sit position |
| Accidentals | ♭♮♯𝄫𝄪, measure-scoped state, cautionary/courtesy, chord stacking |
| Ledger lines | Above/below both staves |
| Stems & flags | Direction/length rules, 8th–64th flags |
| Beaming | Automatic: beat grouping, slope, secondary beams, hooks, breaking |
| Tuplets | Single-level, bracket + numeral |
| Barlines | Single/double/dashed/final/repeat |
| Breath marks | Comma and caesura, attached to a note |
| Ties | Within/across barline, chord-wise |
| Slurs | Single-system, note-to-note |
| Spacing/justification | Duration-proportional, system-width justified |
| Multi-measure | Any count, greedy system breaking |
| Multi-voice | 2 voices per staff |
| Interaction | Click-to-insert, extensible to full editing |
| Playback position | Discrete highlight + continuous cursor, exported timemap |
| Accessibility | aria-label per note, text alternative |
| Theming | CSS custom properties |

Deferred — explicit, not accidental. Most are additive later, not a redesign, given the package split already in place and MNX already representing most of them in the schema — except where a row's cost says otherwise:

| Deferred | Cost to add later |
| --- | --- |
| Grand staff / piano brace | Medium-high — **most likely to come back, check exercise catalogue before Phase 2**. MNX already represents it (a part's `staves` count), so this is an engine-only cost: a vertical-system concept and a brace glyph, no schema change |
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

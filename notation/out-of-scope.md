# Out of scope

Companion to `README.md`'s in-scope/deferred tables, written after auditing the full corpus against [Wikipedia's list of musical symbols](https://en.wikipedia.org/wiki/List_of_musical_symbols). `README.md`'s deferred table already names most of the big-ticket items (grand staff, ornaments, dynamics, lyrics, percussion, tablature, mensural notation, page layout) with a cost estimate each. This file exists for two narrower reasons the audit surfaced:

1. Items that don't fit neatly into any existing deferred row, so they'd otherwise be silently missing rather than tracked.
2. A place to say plainly that some symbols are excluded not because they're expensive, but because they're outside an ear-training app's domain — worth stating explicitly, since the longer-term goal is a genuinely general, separated notation interface (`architecture.md`'s package split and `sideEffects:false` already anticipate extraction), not just what today's app needs.

Nothing here is urgent. Ordering is by how likely it is to actually come up.

Three related gaps this same audit found — bass clef 8va (`fClef8va`), dashed barlines, and breath marks/caesura — were small and self-contained enough to fix directly instead of deferring; see `font.md`, `mnx.md`, and `engraving.md` for the result.

## Needs infrastructure that doesn't exist yet

Not expensive individually, but each waits on a piece of machinery this codebase hasn't built:

| Symbol | Waits on | Notes |
| --- | --- | --- |
| Octave lines (8va/8vb/15ma/15mb performance directives) | A "horizontal span annotation" concept | Distinct from the octave *clef* glyphs (already supported) — a dashed line + numeral over a note range that shifts sounding pitch without changing the written one. Shaped like a slur (spans a tick range) but lives above/below the staff and carries text, not a curve — natural to design alongside ties/slurs (`architecture.md`'s stage 10, "curves") rather than bolt on separately. |
| Metronome mark (♩ = 120) | An above-staff header/annotation area | `playback.md`'s `TempoMap` already tracks tempo as real data — nothing draws it. Cheap once a generic "annotation glyph run above the first system" mechanism exists; the pieces (a duration glyph, an "=" , a number) are all trivial on their own. |
| Glissando line | The same curves infrastructure as ties/slurs | Geometrically simpler than a tie (straight line, not a variable-width curve) — a light addition once that stage exists. |
| Arpeggiated chord roll | Curves infrastructure + a glyph-tiling routine | SMuFL's arpeggio wiggle is a repeatable glyph (`wiggleArpeggiatoUp`), not a single shape — needs the same "repeat a glyph to fill a span" logic beams will eventually use for slope, applied vertically instead of horizontally. |
| Segno, coda glyphs | An annotation/text layer | The glyphs themselves are cheap single-codepoint additions; what's missing is anywhere to place free-floating text/glyphs on the page. Same layer `README.md`'s deferred "Lyrics, chord symbols, rehearsal marks" row is already waiting on. |
| D.C. / D.S. / al Fine / Fine | The same text layer, plus real navigation logic | Beyond drawing the text, "al Fine" implies the player/renderer understands score-level jumps — a bigger feature than the glyph. |
| Simile marks (%, repeat-previous-measure) | The same text layer | Otherwise close in spirit to the already-deferred "repeats/voltas/jumps" row. |
| Ghost notes (parenthesized notehead) | `README.md`'s deferred "Full percussion notation" | Not named there individually; recorded here so it isn't forgotten when that work starts. |
| Tremolo (slash marks through/between stems) | `README.md`'s deferred "Grace notes, ornaments, glissandi" row | Same reasoning as ghost notes — bucketed but not named. |

## Deliberately outside an ear-training app's domain

A generic notation library might eventually want these; an app that renders abstract pitch/rhythm/harmony content for training purposes has no use for instrument-specific performance technique. Same reasoning `README.md` already applies to excluding tablature and figured bass — recorded here so the boundary is explicit rather than merely absent:

- Bowed-string technique marks: pizzicato (left-hand and snap/Bartók), natural harmonics, up-bow/down-bow, mute (con sordino/senza sordino)
- Guitar fingerpicking letters (p/i/m/a/c/x/e/q)
- Hand and finger indicators: piano (L.H./R.H., fingers 1–5), string/harp fingerings (0–4), mallet-percussion numbers (4- and 6-mallet)
- Organ manual abbreviations (Great, Swell, Choir, Pedal, Solo, Orchestral, Antiphonal, Echo, Positiv)

Piano pedal *marks themselves* (the Ped./\* symbols) are not in this bucket — they're already covered by `README.md`'s deferred "Dynamics, articulations, pedal" row, since a pedal indication is a performance direction on the music rather than an instrument-specific fingering system.

## Deliberately excluded, unlikely to ever matter here

- **Large / Longa note values** — pre-Baroque mensural notation, already covered by `README.md`'s "RTL/vertical/mensural notation | n/a" deferral; named here only for completeness against the Wikipedia audit.
- **128th and 256th notes** — `Duration.base` stops at 64th. Real tonal, pedagogical repertoire essentially never needs shorter values. Cheap to extend later (two more flag/rest glyph pairs, one more `DurationBase` union member) if a use case ever actually appears — not a breaking change, unlike the tuplet/microtonal items `README.md` already flags.
- **Neutral/percussion clef** — bucketed under `README.md`'s deferred "Full percussion notation."

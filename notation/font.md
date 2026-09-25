# Font

## Decision: Bravura

Bravura 1.482 (2026-08-24), SMuFL reference font, SIL OFL-1.1, Reserved Font Name "Bravura".

Rejected alternatives:

| Font | Why not |
| --- | --- |
| Leland | Smaller subset (489 vs Bravura's 3,468 glyphs) — but subsetting makes that a 0-byte difference at ship time (6,664B vs 9,156B for our 57-glyph set). Fewer anchors (148 vs 643) — stem attachment depends on anchors and will depend on more as scope grows. |
| Petaluma | Handwritten/jazz style — wrong register for a legibility-first training app. |
| Bravura Text | Built for inline text-flow advance widths; every glyph here is positioned manually, text-flow advance is never used. 1.4× the size for no benefit. |

Font choice is a build-time swap, not lock-in: Leland/Petaluma are SMuFL-compliant at the same codepoints, same 1000 units/em. Swap = change the subset manifest's input file + the `engravingDefaults` values (`architecture.md`) — no layout code changes, nothing in the layout engine hardcodes a thickness or width.

## License obligation

OFL-FAQ 2.6: subsetting a web font is modification; a modified font "would not normally allow the use of RFNs." Our 61-glyph subset does not preserve Functional Equivalence (the full character inventory), so:

- The subsetted font ships under a **renamed family** — CFF `FontName`/`FullName`/`FamilyName` + name IDs 1/4/6/16 rewritten to `PolyhymniaNotation` at build time. `pyftsubset --name-IDs=''` empties the `name` table but leaves the CFF top-dict names (`Bravura`) unchanged — the rename needs an explicit build step or this is a silent compliance bug.
- Ship `OFL.txt` + copyright/authorship notice + upstream pointer alongside.
- Renamed `font-family` also avoids a real bug: a system-installed Bravura of a different version could otherwise resolve under `font-family: Bravura`, silently mismatching our metadata's advance widths.

Our reading of the FAQ, not legal advice — flagged in `roadmap.md` open questions.

## Glyph set — 61 glyphs, full scope

Staff lines, ledger lines, barlines (the lines themselves) and stems are **not glyphs** — drawn as `<rect>`, thickness from `engravingDefaults` (`architecture.md`); they need exact-length stretching (justification), which a glyph can't do. Beams are likewise not a glyph, but a `<path>` parallelogram (`architecture.md`'s `PathShape`) rather than a rect, since they slope. Repeat-barline dots ARE a glyph (below) — a fixed shape, no stretching needed.

| Category | Codepoints | Count |
| --- | --- | --- |
| Clefs | E050 gClef, E052 gClef8vb, E053 gClef8va, E05C cClef, E062 fClef, E064 fClef8vb, E065 fClef8va | 7 |
| Time signature | E080–E08B (digits 0–9 + common + cut) | 12 |
| Noteheads | E0A0 breve, E0A2 whole, E0A3 half, E0A4 black | 4 |
| Augmentation dot | E1E7 | 1 |
| Flags | E240–E247 (8th–64th, up/down) | 8 |
| Accidentals | E260 flat, E261 natural, E262 sharp, E263 double sharp, E264 double flat | 5 |
| Accidental parens | E26A, E26B | 2 |
| Rests | E4E2–E4E9 (breve→64th) | 8 |
| Tuplet digits + colon | E880–E88A | 11 |
| Repeat barline | E044 repeatDot | 1 |
| Breath marks | E4CE breathMarkComma, E4D1 caesura | 2 |
| **Total** | | **61** |

`augmentationDot` is `U+E1E7` — not `U+E4E5` (that's `restQuarter`, part of the rest block).

## Sizes — measured, fontTools/pyftsubset, Bravura 1.482

| Glyph count | WOFF2 | Use |
| --- | --- | --- |
| 9 | 3,128 B | Phase-1 minimum: clefs, 3 noteheads, 3 accidentals, dot |
| 57 | 9,156 B | Full scope minus `repeatDot` (measured before that glyph was added to the subset) |
| 61 | **9,448 B** | Full scope (table above) — measured at the Phase 0 build |
| 88 | 10,984 B | + articulations, fermatas, dynamics, keyboard pedal marks (E650 block), brace, X-notehead — headroom for deferred features |

Metadata (advance widths, bboxes, anchors) filtered to the 61-glyph set: 7,210 B raw / **1,886 B gzipped**. Full `Bravura.json` is 1,256,995 B — unfiltered metadata costs >100× more than the font.

**Total wire cost, full scope: ~11 KB** (9,448 B font + 1,886 B gz metadata). `vexflow-core` alone is 328.7 KB before fonts, for comparison.

## Build

```sh
pyftsubset Bravura.otf \
  --unicodes="U+E044,U+E050,U+E052,U+E053,U+E05C,U+E062,U+E064,U+E065,U+E080-E08B,U+E0A0,U+E0A2-E0A4,\
U+E1E7,U+E240-E247,U+E260-E264,U+E26A,U+E26B,U+E4CE,U+E4D1,U+E4E2-E4E9,U+E880-E88A" \
  --output-file=polyhymnia-notation.woff2 --flavor=woff2 \
  --no-hinting --desubroutinize \
  --drop-tables+=GSUB,GPOS,BASE,JSTF,DSIG --name-IDs='' --notdef-outline
# then: rename CFF FontName/FullName/FamilyName + name IDs 1/4/6/16 -> "PolyhymniaNotation"
```

Same manifest drives both the WOFF2 and the filtered metadata JSON — they can't drift apart.

## Rejected alternative: build-time SVG path extraction

Extract the 57 glyph outlines as path data at build time, render `<path>`/`<use>`, no `@font-face`. Measured: 37,945 B raw / 14,232 B gzipped — 55% larger than the WOFF2 subset (WOFF2's CFF compression beats gzip-over-path-strings). Kept as a secondary build output (PNG/PDF export, FOUT fallback), not the default.

Layout is unaffected either way: every advance width/bbox comes from the metadata JSON, so the layout engine is a pure function with no DOM measurement — it runs in Node regardless of which glyph-rendering path ships.

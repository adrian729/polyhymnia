// SMuFL glyph name -> codepoint for the 58-glyph subset (font.md). Mirrors
// notation-font's build manifest; the metadata JSON carries metrics but no codepoints,
// and notation-font is build-time-only so it can't be imported as a runtime dependency.
//
// Staff lines, ledger lines, barlines, stems and beams are deliberately absent: they
// are <rect>s with thicknesses from `engravingDefaults`, not glyphs, because all of
// them need exact-length stretching or rotation.

export const GLYPH_CODEPOINT: Record<string, number> = {
  // Clefs
  gClef: 0xe050,
  gClef8vb: 0xe052,
  gClef8va: 0xe053,
  cClef: 0xe05c,
  fClef: 0xe062,
  fClef8vb: 0xe064,

  // Time signature digits + common/cut
  timeSig0: 0xe080,
  timeSig1: 0xe081,
  timeSig2: 0xe082,
  timeSig3: 0xe083,
  timeSig4: 0xe084,
  timeSig5: 0xe085,
  timeSig6: 0xe086,
  timeSig7: 0xe087,
  timeSig8: 0xe088,
  timeSig9: 0xe089,
  timeSigCommon: 0xe08a,
  timeSigCutCommon: 0xe08b,

  // Noteheads
  noteheadDoubleWhole: 0xe0a0,
  noteheadWhole: 0xe0a2,
  noteheadHalf: 0xe0a3,
  noteheadBlack: 0xe0a4,

  // Augmentation dot — U+E1E7, NOT U+E4E5 (that is restQuarter)
  augmentationDot: 0xe1e7,

  // Flags
  flag8thUp: 0xe240,
  flag8thDown: 0xe241,
  flag16thUp: 0xe242,
  flag16thDown: 0xe243,
  flag32ndUp: 0xe244,
  flag32ndDown: 0xe245,
  flag64thUp: 0xe246,
  flag64thDown: 0xe247,

  // Accidentals
  accidentalFlat: 0xe260,
  accidentalNatural: 0xe261,
  accidentalSharp: 0xe262,
  accidentalDoubleSharp: 0xe263,
  accidentalDoubleFlat: 0xe264,
  accidentalParensLeft: 0xe26a,
  accidentalParensRight: 0xe26b,

  // Rests
  restDoubleWhole: 0xe4e2,
  restWhole: 0xe4e3,
  restHalf: 0xe4e4,
  restQuarter: 0xe4e5,
  rest8th: 0xe4e6,
  rest16th: 0xe4e7,
  rest32nd: 0xe4e8,
  rest64th: 0xe4e9,

  // Tuplet digits + colon
  tuplet0: 0xe880,
  tuplet1: 0xe881,
  tuplet2: 0xe882,
  tuplet3: 0xe883,
  tuplet4: 0xe884,
  tuplet5: 0xe885,
  tuplet6: 0xe886,
  tuplet7: 0xe887,
  tuplet8: 0xe888,
  tuplet9: 0xe889,
  tupletColon: 0xe88a,

  // Repeat barline dot
  repeatDot: 0xe044,
};

export function glyphCodepoint(name: string): number | undefined {
  return GLYPH_CODEPOINT[name];
}

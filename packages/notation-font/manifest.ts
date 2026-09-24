// Single source of truth for the glyph subset — drives both the WOFF2 build
// and the filtered metadata JSON so they can't drift apart (font.md).
export const SOURCE_FONT = 'Bravura.otf';
export const SOURCE_VERSION = '1.482';
export const RENAMED_FAMILY = 'PolyhymniaNotation';

// name -> codepoint, resolved against the SMuFL glyphnames.json registry.
export const GLYPHS: Record<string, string> = {
  // Clefs
  gClef: 'E050', gClef8vb: 'E052', gClef8va: 'E053',
  cClef: 'E05C', fClef: 'E062', fClef8vb: 'E064', fClef8va: 'E065',
  // Time signature digits + common/cut
  timeSig0: 'E080', timeSig1: 'E081', timeSig2: 'E082', timeSig3: 'E083', timeSig4: 'E084',
  timeSig5: 'E085', timeSig6: 'E086', timeSig7: 'E087', timeSig8: 'E088', timeSig9: 'E089',
  timeSigCommon: 'E08A', timeSigCutCommon: 'E08B',
  // Noteheads
  noteheadDoubleWhole: 'E0A0', noteheadWhole: 'E0A2', noteheadHalf: 'E0A3', noteheadBlack: 'E0A4',
  // Augmentation dot
  augmentationDot: 'E1E7',
  // Flags
  flag8thUp: 'E240', flag8thDown: 'E241', flag16thUp: 'E242', flag16thDown: 'E243',
  flag32ndUp: 'E244', flag32ndDown: 'E245', flag64thUp: 'E246', flag64thDown: 'E247',
  // Accidentals
  accidentalFlat: 'E260', accidentalNatural: 'E261', accidentalSharp: 'E262',
  accidentalDoubleSharp: 'E263', accidentalDoubleFlat: 'E264',
  accidentalParensLeft: 'E26A', accidentalParensRight: 'E26B',
  // Rests
  restDoubleWhole: 'E4E2', restWhole: 'E4E3', restHalf: 'E4E4', restQuarter: 'E4E5',
  rest8th: 'E4E6', rest16th: 'E4E7', rest32nd: 'E4E8', rest64th: 'E4E9',
  // Tuplet digits + colon
  tuplet0: 'E880', tuplet1: 'E881', tuplet2: 'E882', tuplet3: 'E883', tuplet4: 'E884',
  tuplet5: 'E885', tuplet6: 'E886', tuplet7: 'E887', tuplet8: 'E888', tuplet9: 'E889',
  tupletColon: 'E88A',
  // Repeat barline dot
  repeatDot: 'E044',
  // Breaks
  breathMarkComma: 'E4CE',
  caesura: 'E4D1',
};

export const UNICODE_RANGES = Object.values(GLYPHS)
  .map((cp) => `U+${cp}`)
  .join(',');

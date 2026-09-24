// Font metrics. Every advance width, bbox, anchor and engraving thickness comes from
// the build-time metadata JSON — the layout engine measures nothing and hardcodes
// nothing, which is what lets it run in Node with no DOM (font.md, architecture.md).

// The import attribute keeps the emitted ESM loadable by bare Node, not just by a
// bundler — architecture.md's "runs in Node" property is what makes the layout engine
// testable and SSR-safe.
import raw from '../../../notation-font/dist/metadata.json' with { type: 'json' };

export type GlyphName = keyof typeof raw.glyphAdvanceWidths;

/** SMuFL coordinates: staff spaces, y up, origin at the glyph's baseline attachment. */
export interface GlyphBBox {
  bBoxNE: readonly [number, number];
  bBoxSW: readonly [number, number];
}

export type GlyphAnchors = Readonly<Record<string, readonly [number, number]>>;

/**
 * Thicknesses for the non-glyph elements (staff lines, stems, beams, barlines, ledger
 * lines, brackets, slur/tie paths) drawn as `<rect>`/`<path>` rather than glyphs.
 * Values are in staff spaces and are never hardcoded — swapping the font swaps these.
 */
export interface EngravingDefaults {
  staffLineThickness: number;
  stemThickness: number;
  beamThickness: number;
  beamSpacing: number;
  legerLineThickness: number;
  legerLineExtension: number;
  thinBarlineThickness: number;
  thickBarlineThickness: number;
  barlineSeparation: number;
  thinThickBarlineSeparation: number;
  repeatBarlineDotSeparation: number;
  tupletBracketThickness: number;
  slurEndpointThickness: number;
  slurMidpointThickness: number;
  tieEndpointThickness: number;
  tieMidpointThickness: number;
  bracketThickness: number;
  subBracketThickness: number;
  hairpinThickness: number;
  octaveLineThickness: number;
  pedalLineThickness: number;
  repeatEndingLineThickness: number;
  arrowShaftThickness: number;
  dashedBarlineThickness: number;
  dashedBarlineDashLength: number;
  dashedBarlineGapLength: number;
  hBarThickness: number;
  lyricLineThickness: number;
  textEnclosureThickness: number;
  textFontFamily: readonly string[];
}

export interface FontMetadata {
  fontName: string;
  fontVersion: string;
  engravingDefaults: EngravingDefaults;
  glyphAdvanceWidths: Readonly<Record<string, number>>;
  glyphBBoxes: Readonly<Record<string, GlyphBBox>>;
  glyphsWithAnchors: Readonly<Record<string, GlyphAnchors>>;
}

export const fontMetadata: FontMetadata = raw as unknown as FontMetadata;

export const fontName: string = fontMetadata.fontName;
export const fontVersion: string = fontMetadata.fontVersion;

/** Read off the metadata JSON at import time, never hardcoded (architecture.md). */
export const engravingDefaults: EngravingDefaults = fontMetadata.engravingDefaults;

/**
 * Advance width in staff spaces. A name the subset doesn't carry yields 0 rather than
 * throwing: the layout pipeline degrades visibly instead of crashing a live quiz, and
 * `GlyphName` already makes an unknown name a compile error on the normal path.
 */
export function glyphAdvanceWidth(name: GlyphName | string): number {
  return fontMetadata.glyphAdvanceWidths[name] ?? 0;
}

const EMPTY_BBOX: GlyphBBox = { bBoxNE: [0, 0], bBoxSW: [0, 0] };

export function glyphBBox(name: GlyphName | string): GlyphBBox {
  return fontMetadata.glyphBBoxes[name] ?? EMPTY_BBOX;
}

/** Undefined for the majority of glyphs — only 16 in the subset carry anchors. */
export function glyphAnchors(name: GlyphName | string): GlyphAnchors | undefined {
  return fontMetadata.glyphsWithAnchors[name];
}

/** e.g. `glyphAnchor('noteheadBlack', 'stemUpSE')` — the stem attachment point. */
export function glyphAnchor(
  name: GlyphName | string,
  anchor: string,
): readonly [number, number] | undefined {
  return glyphAnchors(name)?.[anchor];
}

export function hasGlyph(name: string): name is GlyphName {
  return name in fontMetadata.glyphAdvanceWidths;
}

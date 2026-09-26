import raw from './metadata.json' with { type: 'json' };

export type GlyphName = keyof typeof raw.glyphAdvanceWidths;

export interface GlyphBBox {
  bBoxNE: readonly [number, number];
  bBoxSW: readonly [number, number];
}

export type GlyphAnchors = Readonly<Record<string, readonly [number, number]>>;

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

export const engravingDefaults: EngravingDefaults = fontMetadata.engravingDefaults;

export function glyphAdvanceWidth(name: GlyphName | string): number {
  return fontMetadata.glyphAdvanceWidths[name] ?? 0;
}

const EMPTY_BBOX: GlyphBBox = { bBoxNE: [0, 0], bBoxSW: [0, 0] };

export function glyphBBox(name: GlyphName | string): GlyphBBox {
  return fontMetadata.glyphBBoxes[name] ?? EMPTY_BBOX;
}

export function glyphAnchors(name: GlyphName | string): GlyphAnchors | undefined {
  return fontMetadata.glyphsWithAnchors[name];
}

export function glyphAnchor(
  name: GlyphName | string,
  anchor: string,
): readonly [number, number] | undefined {
  return glyphAnchors(name)?.[anchor];
}

export function hasGlyph(name: string): name is GlyphName {
  return name in fontMetadata.glyphAdvanceWidths;
}

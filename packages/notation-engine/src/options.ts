export interface NotationOptions {
  divisions?: number;
  spacing?: { k?: number; base?: number };
  beaming?: { mergeBeats?: boolean; beatGrouping?: Readonly<Record<string, readonly number[]>> };
  accidentals?: {
    courtesyPolicy?: 'none' | 'next-measure' | 'always';
    parenthesizeCautionary?: boolean;
    insertAlteration?: 'key' | 'natural';
  };
  tuplets?: { showRatio?: boolean };
  widthSp?: number;
  maxLastSystemFill?: number;
}

export const DEFAULT_OPTIONS = {
  divisions: 3360,
  spacing: { k: 0.55, base: 3.2 },
  beaming: { mergeBeats: true },
  accidentals: {
    courtesyPolicy: 'next-measure' as const,
    parenthesizeCautionary: false,
    insertAlteration: 'key' as const,
  },
  tuplets: { showRatio: false },
  widthSp: 100,
  maxLastSystemFill: 0.65,
} satisfies NotationOptions;

// The single options surface, shared by `layoutScore(score, options)` and the React
// `options` prop (interface.md "## Options"). Every field defaults.

import type { Duration, DurationToken } from '@polyhymnia/notation-model';

export interface NotationOptions {
  /** engraving.md spring/rod spacing, default k=0.55 base=3.2sp */
  spacing?: { k?: number; base?: number };
  /** default halfBarBeaming=true; `beatGrouping` is a score-wide fallback, overridden
   *  per-measure by `TimeSpec.beatGrouping` */
  beaming?: { halfBarBeaming?: boolean; beatGrouping?: readonly number[] };
  accidentals?: {
    courtesyPolicy?: 'none' | 'next-measure' | 'always'; // default 'next-measure'
    parenthesizeCautionary?: boolean;
    insertAlteration?: 'key' | 'natural'; // interaction.md, default 'key'
  };
  /** default: beat subdivision implied by the meter */
  insertGrid?: DurationToken | Duration;
  /** engraving.md, default false — numeral shows actual only */
  tuplets?: { showRatio?: boolean };
  font?: { family?: string; url?: string };
  /** system width in sp (engraving.md) */
  widthSp?: number;
  /** default 0.65 (engraving.md) */
  maxLastSystemFill?: number;
}

/** Resolved defaults for the fields the stages implemented so far actually read.
 *  Stages 3-11 extend this as they land. */
export const DEFAULT_OPTIONS = {
  spacing: { k: 0.55, base: 3.2 },
  beaming: { halfBarBeaming: true },
  accidentals: {
    courtesyPolicy: 'next-measure' as const,
    parenthesizeCautionary: false,
    insertAlteration: 'key' as const,
  },
  tuplets: { showRatio: false },
  // engraving.md names `widthSp` but fixes no default. 100sp is one printed system at a
  // conventional rastral size (~180mm at a 1.75mm staff space) — wide enough for four
  // moderately busy measures, which is the shape of an exercise.
  widthSp: 100,
  maxLastSystemFill: 0.65,
} satisfies NotationOptions;

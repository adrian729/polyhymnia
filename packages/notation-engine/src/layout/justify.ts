// Pipeline stage 8 — justify (architecture.md, engraving.md "Justify per system").
//
// Distribute each system's slack over its springs and turn column widths into absolute
// x. The last system is deliberately not force-justified: stretching a two-measure final
// system to full width produces the "two notes stranded at opposite ends" look.

import { DEFAULT_OPTIONS, type NotationOptions } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import { chromeWidth, measureWidth, type HorizontalMeasure } from './horizontal.js';
import type { BreakScore } from './break.js';

export interface JustifiedSystem {
  index: number;
  measures: readonly HorizontalMeasure[];
  /** Final width after justification, in sp. */
  width: number;
  naturalWidth: number;
}

export interface JustifiedScore {
  systems: readonly JustifiedSystem[];
  /** Widest system — the viewBox width the emit stage uses. */
  width: number;
  diagnostics: readonly Diagnostic[];
}

export function justify(broken: BreakScore, options?: NotationOptions): JustifiedScore {
  const widthSp = options?.widthSp ?? DEFAULT_OPTIONS.widthSp;
  const maxLastFill = options?.maxLastSystemFill ?? DEFAULT_OPTIONS.maxLastSystemFill;

  const systems: JustifiedSystem[] = [];
  for (const system of broken.systems) {
    const isLast = system.index === broken.systems.length - 1;
    const natural = system.measures.reduce(
      (sum, m, i) => sum + measureWidth(m, i === 0),
      0,
    );
    // Last system: natural width, optionally stretched up to `maxLastSystemFill` of the
    // full width — never past it, and never shrunk below its own natural width.
    const target = isLast
      ? Math.max(natural, Math.min(widthSp, maxLastFill * widthSp))
      : Math.max(natural, widthSp);
    const slack = Math.max(0, target - natural);
    const totalStretch = system.measures.reduce(
      (sum, m) => sum + m.columns.reduce((s, c) => s + c.stretch, 0),
      0,
    );

    let x = 0;
    for (const measure of system.measures) {
      measure.x = x;
      measure.systemIndex = system.index;
      x += chromeWidth(measure.chrome);
      for (const column of measure.columns) {
        column.xStart = x;
        column.x = x + column.leftWidth;
        const extra = totalStretch > 0 ? (slack * column.stretch) / totalStretch : 0;
        x += column.width + extra;
      }
      if (measure.columns.length === 0) x += measure.contentWidth;
      x += measure.chrome.endBarlineWidth;
      measure.width = x - measure.x;
    }

    systems.push({ index: system.index, measures: system.measures, width: x, naturalWidth: natural });
  }

  return {
    systems,
    width: systems.reduce((max, s) => Math.max(max, s.width), 0),
    diagnostics: [],
  };
}

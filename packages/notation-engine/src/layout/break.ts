// Pipeline stage 7 — break (architecture.md, engraving.md "System breaking").
//
// Greedy: accumulate measures until the next one would exceed `options.widthSp`,
// accounting for the clef/key restatement each new system pays for. `Measure.systemBreak`
// forces a break. Knuth-Plass-style global optimization is deferred — exercises are 1-8
// measures — and would not change this stage's signature.

import { DEFAULT_OPTIONS, type NotationOptions } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import { measureWidth, type HorizontalMeasure, type HorizontalScore } from './horizontal.js';

export interface SystemAssignment {
  index: number;
  measures: readonly HorizontalMeasure[];
  naturalWidth: number;
}

export interface BreakScore {
  systems: readonly SystemAssignment[];
  diagnostics: readonly Diagnostic[];
}

export function breakSystems(score: HorizontalScore, options?: NotationOptions): BreakScore {
  const widthSp = options?.widthSp ?? DEFAULT_OPTIONS.widthSp;
  const systems: SystemAssignment[] = [];
  let current: HorizontalMeasure[] = [];
  let width = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    systems.push({ index: systems.length, measures: current, naturalWidth: width });
    current = [];
    width = 0;
  };

  for (const measure of score.measures) {
    const atStart = current.length === 0;
    let candidate = measureWidth(measure, atStart);
    // A measure that does not fit still starts a new system rather than being split:
    // the measure is the indivisible unit here.
    if (!atStart && width + candidate > widthSp) {
      flush();
      candidate = measureWidth(measure, true);
    }
    const startsSystem = current.length === 0;
    measure.chrome = startsSystem ? measure.startChrome : measure.midChrome;
    measure.systemIndex = systems.length;
    current.push(measure);
    width += candidate;
    if (measure.systemBreak) flush();
  }
  flush();

  return { systems, diagnostics: [] };
}

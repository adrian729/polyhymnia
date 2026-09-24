// `layoutScore()` — the public entry point (architecture.md's React layer,
// interface.md's options surface). Every stage is a pure function, so the whole
// composition is pure: StrictMode double-invocation produces identical output, and the
// result is testable in Node with no DOM and no font loaded.
//
// Stages 9 (beams) and 10 (curves) are not implemented yet: eighth notes and shorter
// carry flags rather than beams, and `paths` is always empty.

import type { NotationOptions } from '../options.js';
import type { Diagnostic, ScoreDoc } from '@polyhymnia/notation-model';
import { accidentals } from './accidentals.js';
import { breakSystems } from './break.js';
import { emit } from './emit.js';
import { grouping } from './grouping.js';
import { horizontal } from './horizontal.js';
import { justify } from './justify.js';
import { normalize } from './normalize.js';
import { temporal } from './temporal.js';
import type { LayoutResult } from './types.js';
import { vertical } from './vertical.js';

export function layoutScore(score: ScoreDoc, options?: NotationOptions): LayoutResult {
  const normalized = normalize(score, options);
  const timed = temporal(normalized, options);
  const resolvedAccidentals = accidentals(normalized, timed, options);
  const groups = grouping(timed, options);
  const placed = vertical(normalized, timed, resolvedAccidentals, options);
  const spaced = horizontal(normalized, timed, placed, options);
  const broken = breakSystems(spaced, options);
  const justified = justify(broken, options);

  const diagnostics: Diagnostic[] = [
    ...normalized.diagnostics,
    ...timed.diagnostics,
    ...resolvedAccidentals.diagnostics,
    ...groups.diagnostics,
    ...placed.diagnostics,
    ...spaced.diagnostics,
    ...broken.diagnostics,
    ...justified.diagnostics,
  ];

  return emit(
    {
      justified,
      temporal: timed,
      tempo: normalized.tempo,
      divisions: normalized.divisions,
      diagnostics,
    },
    options,
  );
}

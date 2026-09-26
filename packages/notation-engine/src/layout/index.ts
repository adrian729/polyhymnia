// `layoutScore()` — the public entry point (architecture.md's React layer,
// interface.md's options surface). Every stage is a pure function, so the whole
// composition is pure: StrictMode double-invocation produces identical output, and the
// result is testable in Node with no DOM and no font loaded.

import type { NotationOptions } from '../options.js';
import type { Diagnostic, MnxDocument } from '@polyhymnia/notation-model';
import { accidentals } from './accidentals.js';
import { beams } from './beams.js';
import { breakSystems } from './break.js';
import { curves } from './curves.js';
import { emit } from './emit.js';
import { grouping } from './grouping.js';
import { horizontal } from './horizontal.js';
import { justify } from './justify.js';
import { normalize } from './normalize.js';
import { temporal } from './temporal.js';
import { tuplets } from './tuplets.js';
import type { LayoutResult } from './types.js';
import { vertical } from './vertical.js';

export function layoutScore(doc: MnxDocument, options?: NotationOptions): LayoutResult {
  const normalized = normalize(doc, options);
  const timed = temporal(normalized, options);
  const resolvedAccidentals = accidentals(normalized, timed, options);
  const groups = grouping(normalized, timed, options);
  const placed = vertical(normalized, timed, resolvedAccidentals, options);
  const spaced = horizontal(normalized, timed, placed, options);
  const broken = breakSystems(spaced, options);
  const justified = justify(broken, options);
  const beamed = beams(justified, normalized.beams);
  const tupletShapes = tuplets(justified, groups.tuplets, normalized.beams, beamed, options);
  const curveShapes = curves(justified, placed, beamed, normalized.ties, options);

  const diagnostics: Diagnostic[] = [
    ...normalized.diagnostics,
    ...timed.diagnostics,
    ...resolvedAccidentals.diagnostics,
    ...groups.diagnostics,
    ...placed.diagnostics,
    ...spaced.diagnostics,
    ...broken.diagnostics,
    ...justified.diagnostics,
    ...beamed.diagnostics,
    ...tupletShapes.diagnostics,
    ...curveShapes.diagnostics,
  ];

  return emit(
    {
      justified,
      temporal: timed,
      tempo: normalized.tempo,
      divisions: normalized.divisions,
      diagnostics,
      beams: beamed,
      tuplets: tupletShapes,
      curves: curveShapes,
    },
    options,
  );
}

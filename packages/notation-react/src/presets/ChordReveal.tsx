// interface.md "## Presets" — sugar over a directly-built MNX document, not a feature
// of its own.

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { NoteValue } from '@polyhymnia/notation-model';
import type { ClefSpec } from '@polyhymnia/notation-engine';
import type { LayoutResult } from '@polyhymnia/notation-engine';
import { Notation } from '../Notation.js';
import { fittingMeter, durationKey } from './shared.js';
import { buildMeasureScore, chordEvent } from './mnxBuild.js';

const QUARTER: NoteValue = { base: 'quarter' };

export interface ChordRevealProps {
  pitches: readonly string[];
  clef: ClefSpec['kind'];
  duration?: NoteValue;
  className?: string;
  style?: CSSProperties;
  /** Additive over interface.md's listed props — the same `<Notation>` escape hatch,
   *  so a preset is still inspectable (diagnostics, timemap) without unwrapping it. */
  onLayout?: (layout: LayoutResult) => void;
}

export function ChordReveal({
  pitches,
  clef,
  duration = QUARTER,
  className,
  style,
  onLayout,
}: ChordRevealProps): JSX.Element {
  const doc = useMemo(
    () => buildMeasureScore(clef, fittingMeter(duration, 1), [chordEvent(pitches, duration)]),
    [pitches.join(' '), clef, durationKey(duration)],
  );
  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

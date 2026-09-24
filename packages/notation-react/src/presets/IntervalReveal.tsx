// interface.md "## Presets".

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { NoteValue } from '@polyhymnia/notation-model';
import type { ClefSpec } from '@polyhymnia/notation-engine';
import type { LayoutResult } from '@polyhymnia/notation-engine';
import { Notation } from '../Notation.js';
import { durationKey, fittingMeter } from './shared.js';
import { buildMeasureScore, chordEvent, noteEvent } from './mnxBuild.js';

const QUARTER: NoteValue = { base: 'quarter' };

export interface IntervalRevealProps {
  from: string;
  to: string;
  clef: ClefSpec['kind'];
  mode: 'harmonic' | 'melodic';
  duration?: NoteValue;
  className?: string;
  style?: CSSProperties;
  /** Additive over interface.md's listed props — the same `<Notation>` escape hatch,
   *  so a preset is still inspectable (diagnostics, timemap) without unwrapping it. */
  onLayout?: (layout: LayoutResult) => void;
}

export function IntervalReveal({
  from,
  to,
  clef,
  mode,
  duration = QUARTER,
  className,
  style,
  onLayout,
}: IntervalRevealProps): JSX.Element {
  const doc = useMemo(() => {
    // Harmonic = both pitches on one stem, so one beat; melodic = two successive beats.
    const time = fittingMeter(duration, mode === 'harmonic' ? 1 : 2);
    const events =
      mode === 'harmonic'
        ? [chordEvent([from, to], duration)]
        : [noteEvent(from, duration), noteEvent(to, duration)];
    return buildMeasureScore(clef, time, events);
  }, [from, to, clef, mode, durationKey(duration)]);

  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

// interface.md "## Presets".

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import { chord, measure, note, score } from '@earmaster/notation-core';
import type {
  ClefSpec,
  Duration,
  DurationToken,
  LayoutResult,
  PitchToken,
} from '@earmaster/notation-core';
import { Notation } from '../Notation.js';
import { durationKey, fittingMeter } from './shared.js';

export interface IntervalRevealProps {
  from: PitchToken;
  to: PitchToken;
  clef: ClefSpec['kind'];
  mode: 'harmonic' | 'melodic';
  duration?: DurationToken | Duration;
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
  duration = 'q',
  className,
  style,
  onLayout,
}: IntervalRevealProps): JSX.Element {
  const doc = useMemo(() => {
    // Harmonic = both pitches on one stem, so one beat; melodic = two successive beats.
    const time = fittingMeter(duration, mode === 'harmonic' ? 1 : 2);
    const content =
      mode === 'harmonic'
        ? chord([note(from, duration), note(to, duration)])
        : [note(from, duration), note(to, duration)];
    return score({ clef, time }, measure(content));
  }, [from, to, clef, mode, durationKey(duration)]);

  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

// interface.md "## Presets".

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import { measure, note, parsePitch, score } from '@earmaster/notation-core';
import type {
  ClefSpec,
  Duration,
  DurationToken,
  LayoutResult,
  PitchToken,
} from '@earmaster/notation-core';
import { Notation } from '../Notation.js';
import { durationKey, fittingMeter, scalePitches } from './shared.js';
import type { ScaleName } from './shared.js';

export type { ScaleName } from './shared.js';

export interface ScaleRevealProps {
  root: PitchToken;
  scale: ScaleName;
  clef: ClefSpec['kind'];
  descending?: boolean;
  duration?: DurationToken | Duration;
  className?: string;
  style?: CSSProperties;
  /** Additive over interface.md's listed props — the same `<Notation>` escape hatch,
   *  so a preset is still inspectable (diagnostics, timemap) without unwrapping it. */
  onLayout?: (layout: LayoutResult) => void;
}

export function ScaleReveal({
  root,
  scale,
  clef,
  descending = false,
  duration = 'q',
  className,
  style,
  onLayout,
}: ScaleRevealProps): JSX.Element {
  const doc = useMemo(() => {
    const pitches = scalePitches(parsePitch(root), scale, descending);
    return score(
      // No key signature: a scale reveal spells its own accidentals, so the reader sees
      // which degrees are altered instead of inferring them from a signature.
      { clef, time: fittingMeter(duration, pitches.length) },
      measure(pitches.map((p) => note(p, duration))),
    );
  }, [root, scale, clef, descending, durationKey(duration)]);

  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

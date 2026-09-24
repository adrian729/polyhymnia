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
import { durationKey, fittingMeter, scaleKey, scalePitches } from './shared.js';
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
    const rootPitch = parsePitch(root);
    const pitches = scalePitches(rootPitch, scale, descending);
    return score(
      // The scale's own key signature: diatonic degrees then draw no accidental at all
      // (spacing stays even), and only genuinely non-diatonic degrees — the raised 6th/7th
      // in harmonic/melodic minor — still get one, exactly as real notation shows them.
      { clef, key: scaleKey(rootPitch, scale).fifths, time: fittingMeter(duration, pitches.length) },
      measure(pitches.map((p) => note(p, duration))),
    );
  }, [root, scale, clef, descending, durationKey(duration)]);

  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

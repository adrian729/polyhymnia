// interface.md "## Presets".

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import { parsePitch } from '@polyhymnia/notation-model';
import type { NoteValue } from '@polyhymnia/notation-model';
import type { ClefSpec } from '@polyhymnia/notation-engine';
import type { LayoutResult } from '@polyhymnia/notation-engine';
import { Notation } from '../Notation.js';
import { durationKey, fittingMeter, scaleKey, scalePitches } from './shared.js';
import type { ScaleName } from './shared.js';
import { buildMeasureScore, noteEventFromPitch } from './mnxBuild.js';

export type { ScaleName } from './shared.js';

const QUARTER: NoteValue = { base: 'quarter' };

export interface ScaleRevealProps {
  root: string;
  scale: ScaleName;
  clef: ClefSpec['kind'];
  descending?: boolean;
  duration?: NoteValue;
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
  duration = QUARTER,
  className,
  style,
  onLayout,
}: ScaleRevealProps): JSX.Element {
  const doc = useMemo(() => {
    const rootPitch = parsePitch(root);
    const pitches = scalePitches(rootPitch, scale, descending);
    return buildMeasureScore(
      clef,
      // The scale's own key signature: diatonic degrees then draw no accidental at all
      // (spacing stays even), and only genuinely non-diatonic degrees — the raised 6th/7th
      // in harmonic/melodic minor — still get one, exactly as real notation shows them.
      fittingMeter(duration, pitches.length),
      pitches.map((p) => noteEventFromPitch(p, duration)),
      scaleKey(rootPitch, scale).fifths,
    );
  }, [root, scale, clef, descending, durationKey(duration)]);

  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

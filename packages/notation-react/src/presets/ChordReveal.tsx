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

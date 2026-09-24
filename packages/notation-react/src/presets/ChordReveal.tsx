// interface.md "## Presets" — sugar over the builders, not a feature of its own.

import { useMemo } from 'react';
import type { CSSProperties, JSX } from 'react';
import { chord, measure, note, score } from '@polyhymnia/notation-model';
import type { ClefSpec, Duration, DurationToken, PitchToken } from '@polyhymnia/notation-model';
import type { LayoutResult } from '@polyhymnia/notation-engine';
import { Notation } from '../Notation.js';
import { fittingMeter, durationKey } from './shared.js';

export interface ChordRevealProps {
  pitches: readonly PitchToken[];
  clef: ClefSpec['kind'];
  duration?: DurationToken | Duration;
  className?: string;
  style?: CSSProperties;
  /** Additive over interface.md's listed props — the same `<Notation>` escape hatch,
   *  so a preset is still inspectable (diagnostics, timemap) without unwrapping it. */
  onLayout?: (layout: LayoutResult) => void;
}

export function ChordReveal({
  pitches,
  clef,
  duration = 'q',
  className,
  style,
  onLayout,
}: ChordRevealProps): JSX.Element {
  // Rebuilt only when the content actually changes: the builders mint fresh NoteIds on
  // every call, and a new `ScoreDoc` identity re-runs layout.
  const doc = useMemo(
    () =>
      score(
        { clef, time: fittingMeter(duration, 1) },
        measure(chord(pitches.map((p) => note(p, duration)))),
      ),
    [pitches.join(' '), clef, durationKey(duration)],
  );
  return <Notation score={doc} className={className} style={style} onLayout={onLayout} />;
}

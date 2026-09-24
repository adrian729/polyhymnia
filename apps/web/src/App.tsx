// The gallery. Every score is built once at module scope: `<Notation>` memoizes layout
// on the `score` identity, so a stable document means layout runs once per example.

import {
  Notation,
  buildDiagnostics,
  measure,
  note,
  rest,
  score,
  wholeBarRest,
} from '@polyhymnia/notation-react';
import type { ClefSpec, ScoreDoc } from '@polyhymnia/notation-react';
import { ChordReveal, IntervalReveal, ScaleReveal } from '@polyhymnia/notation-react/presets';
import { Example } from './Example.js';

// --- raw-builder documents --------------------------------------------------

const MELODY: ScoreDoc = score(
  { clef: 'treble', key: -1, time: { beats: 3, beatType: 4 } },
  measure(note('F4', 'q'), note('A4', '8'), note('Bb4', '8'), note('C5', 'q')),
  measure(note('D5', 'q.'), note('C5', '8'), note('A4', 'q')),
  measure(note('Bb4', 'q'), rest('8'), note('G4', '8'), note('E4', 'q')),
  measure({ barlineEnd: 'final' }, note('F4', 'h.')),
);

const KEYS = [
  { label: 'C major — no accidentals', fifths: 0 },
  { label: 'G major — 1 sharp', fifths: 1 },
  { label: 'D major — 2 sharps', fifths: 2 },
  { label: 'F major — 1 flat', fifths: -1 },
  { label: 'B♭ major — 2 flats', fifths: -2 },
] as const;

// Built once, not per render: `<Notation>` keys its layout memo on the `score` identity.
const KEY_EXAMPLES: readonly { label: string; doc: ScoreDoc }[] = KEYS.map((k) => ({
  label: k.label,
  doc: score({ clef: 'treble', key: k.fifths }, measure(note('G4', 'w'))),
}));

const CLEFS = [
  { kind: 'treble', label: 'Treble — top line F5' },
  { kind: 'bass', label: 'Bass — top line A3' },
  { kind: 'alto', label: 'Alto — middle line C4' },
  { kind: 'tenor', label: 'Tenor — C4 on the fourth line' },
] as const satisfies readonly { kind: ClefSpec['kind']; label: string }[];

// The same four sounding pitches in each clef: the noteheads move, the pitches do not.
const CLEF_EXAMPLES: readonly { kind: ClefSpec['kind']; label: string; doc: ScoreDoc }[] =
  CLEFS.map((c) => ({
    kind: c.kind,
    label: c.label,
    doc: score(
      { clef: c.kind },
      measure(note('C4', 'q'), note('E4', 'q'), note('G4', 'q'), note('C5', 'q')),
    ),
  }));

// 9/8 is the "unrepresentable capacity" case: 9/8 of a whole note is not a notatable
// rest shape, so the whole-bar rest is one whole-rest glyph standing for the whole bar.
const WHOLE_BAR_REST: ScoreDoc = score(
  { clef: 'treble', time: { beats: 9, beatType: 8 } },
  measure(wholeBarRest()),
);

const MIXED_RESTS: ScoreDoc = score(
  { clef: 'treble' },
  measure(note('C5', 'q'), rest('q'), note('A4', '8'), rest('8'), rest('q')),
  measure({ barlineEnd: 'final' }, rest('h.'), note('G4', 'q')),
);

const LEDGER_LINES: ScoreDoc = score(
  { clef: 'treble' },
  measure(note('C6', 'q'), note('A5', 'q'), note('C4', 'q'), note('E3', 'q')),
  measure({ barlineEnd: 'final' }, note('A6', 'h'), note('C3', 'h')),
);

// Deliberately short of its 4/4 bar — the builders pad it and say so, rather than
// rendering a bar that silently does not add up.
const UNDERFULL: ScoreDoc = score({ clef: 'treble' }, measure(note('C4', 'q')));

// --- page -------------------------------------------------------------------

export function App() {
  return (
    <main>
      <h1>Polyhymnia notation — renderer gallery</h1>
      <p className="lede">
        Every stave below is <code>@polyhymnia/notation-engine</code>&rsquo;s{' '}
        <code>layoutScore()</code> rendered by <code>&lt;Notation&gt;</code>: SVG in staff-space
        units, glyphs from the subsetted Bravura build, no colour anywhere but the
        stylesheet. Beams, ties, slurs and tuplets are later pipeline stages — eighth notes
        carry flags here, by design.
      </p>

      <h2>Chords</h2>
      <div className="row">
        <Example title="C major triad" caption="ChordReveal, treble">
          {(onLayout) => (
            <ChordReveal pitches={['C4', 'E4', 'G4']} clef="treble" onLayout={onLayout} />
          )}
        </Example>
        <Example title="G dominant 7th" caption="ChordReveal, bass, seconds shifted across the stem">
          {(onLayout) => (
            <ChordReveal
              pitches={['G2', 'B2', 'D3', 'F3']}
              clef="bass"
              duration="w"
              onLayout={onLayout}
            />
          )}
        </Example>
        <Example title="D♭ major 7th" caption="ChordReveal — accidentals packed into columns">
          {(onLayout) => (
            <ChordReveal
              pitches={['Db4', 'F4', 'Ab4', 'C5']}
              clef="treble"
              duration="h"
              onLayout={onLayout}
            />
          )}
        </Example>
      </div>

      <h2>Intervals</h2>
      <div className="row">
        <Example title="Major 3rd, harmonic" caption="IntervalReveal — both pitches on one stem">
          {(onLayout) => (
            <IntervalReveal from="C4" to="E4" clef="treble" mode="harmonic" onLayout={onLayout} />
          )}
        </Example>
        <Example title="Major 6th, melodic" caption="IntervalReveal — two successive beats">
          {(onLayout) => (
            <IntervalReveal from="C4" to="A4" clef="treble" mode="melodic" onLayout={onLayout} />
          )}
        </Example>
        <Example title="Tritone, harmonic" caption="A second apart? No — F4 to B4, bass clef">
          {(onLayout) => (
            <IntervalReveal from="F2" to="B2" clef="bass" mode="harmonic" onLayout={onLayout} />
          )}
        </Example>
        <Example title="Descending minor 6th" caption="IntervalReveal, melodic, high to low">
          {(onLayout) => (
            <IntervalReveal from="A4" to="C4" clef="treble" mode="melodic" onLayout={onLayout} />
          )}
        </Example>
      </div>

      <h2>Scales</h2>
      <p className="note">
        Scales are spelled, not transposed: one letter per degree, the accidental derived
        from the interval pattern. No key signature — every alteration is written on the
        note, which is what an ear-training reveal wants to show.
      </p>
      <Example title="C major" caption="ScaleReveal — root C4, ascending">
        {(onLayout) => <ScaleReveal root="C4" scale="major" clef="treble" onLayout={onLayout} />}
      </Example>
      <Example title="E♭ major" caption="Three flats, spelled on the notes">
        {(onLayout) => <ScaleReveal root="Eb4" scale="major" clef="treble" onLayout={onLayout} />}
      </Example>
      <Example title="A natural minor" caption="No accidentals at all">
        {(onLayout) => (
          <ScaleReveal root="A3" scale="naturalMinor" clef="treble" onLayout={onLayout} />
        )}
      </Example>
      <Example title="A harmonic minor" caption="Raised 7th only — G♯, and the augmented 2nd F→G♯">
        {(onLayout) => (
          <ScaleReveal root="A3" scale="harmonicMinor" clef="treble" onLayout={onLayout} />
        )}
      </Example>
      <Example title="A melodic minor, ascending" caption="Raised 6th and 7th — F♯ and G♯">
        {(onLayout) => (
          <ScaleReveal root="A3" scale="melodicMinor" clef="treble" onLayout={onLayout} />
        )}
      </Example>
      <Example
        title="A melodic minor, descending"
        caption="The classical descending form: natural-minor pitches, F♮ and G♮ — a different pitch set, not the ascending notes reversed"
      >
        {(onLayout) => (
          <ScaleReveal root="A3" scale="melodicMinor" clef="treble" descending onLayout={onLayout} />
        )}
      </Example>
      <Example title="D major, descending, bass clef" caption="Direction-independent: the same pitches, reversed">
        {(onLayout) => (
          <ScaleReveal root="D2" scale="major" clef="bass" descending onLayout={onLayout} />
        )}
      </Example>

      <h2>A melody, built from the raw builders</h2>
      <p className="note">
        Four bars of 3/4 in F major, written with <code>score</code>/<code>measure</code>/
        <code>note</code>/<code>rest</code>: barlines, a final barline, dotted values, a rest
        mid-bar, and spacing/justification across the system.
      </p>
      <Example title="F major, 3/4" caption="B♭ comes from the key signature, so no accidental is written">
        {(onLayout) => <Notation score={MELODY} onLayout={onLayout} />}
      </Example>

      <h2>Key signatures</h2>
      <p className="note">Same clef, same note, five signatures — accidental order and staff placement.</p>
      <div className="row">
        {KEY_EXAMPLES.map((k) => (
          <Example key={k.label} title={k.label}>
            {(onLayout) => <Notation score={k.doc} onLayout={onLayout} />}
          </Example>
        ))}
      </div>

      <h2>Clefs</h2>
      <p className="note">
        C4&ndash;E4&ndash;G4&ndash;C5 in each clef. Tenor is the irregular one: its C4 sits on the
        fourth line, a third below the alto placement rather than the octave a naive rule
        would give.
      </p>
      <div className="row">
        {CLEF_EXAMPLES.map((c) => (
          <Example key={c.kind} title={c.label}>
            {(onLayout) => <Notation score={c.doc} onLayout={onLayout} />}
          </Example>
        ))}
      </div>

      <h2>Rests and ledger lines</h2>
      <Example
        title="Whole-bar rest in 9/8"
        caption="9/8 of a whole note is not a notatable rest shape; the whole-bar rest is one glyph standing for the entire bar"
      >
        {(onLayout) => <Notation score={WHOLE_BAR_REST} onLayout={onLayout} />}
      </Example>
      <Example title="Mixed rests" caption="Quarter, eighth, half and dotted-half rests on their conventional staff positions">
        {(onLayout) => <Notation score={MIXED_RESTS} onLayout={onLayout} />}
      </Example>
      <Example title="Ledger lines above and below" caption="C6 and A6 above the staff, C4 and E3 and C3 below it">
        {(onLayout) => <Notation score={LEDGER_LINES} onLayout={onLayout} />}
      </Example>

      <h2>Diagnostics</h2>
      <p className="note">
        A malformed score degrades visibly instead of throwing. This bar holds one quarter
        note in 4/4; the builders padded it to length and attached the warning below, which
        this page renders exactly as any app would.
      </p>
      <Example title="Underfull bar, auto-padded" extra={buildDiagnostics(UNDERFULL)}>
        {(onLayout) => <Notation score={UNDERFULL} onLayout={onLayout} />}
      </Example>

      <footer>
        Not rendered yet, and deliberately absent: beams (eighths carry flags), ties and
        slurs (<code>paths</code> is empty), tuplet brackets, second voices, and every
        interactive affordance — pointer hit-testing, the playback cursor and the
        <code> Notation.Interaction</code>/<code>Notation.Playback</code> compound children.
        Those land with the engine stages behind them.
      </footer>
    </main>
  );
}

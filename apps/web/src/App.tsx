// The gallery. Every score is a hand-written `.mnx.json` file under `src/scores/`
// (interface.md, AGENTS.md "Score format" — MNX is the only score format, so these
// double as reference content for hand-authored MNX): `<Notation>` memoizes layout on
// the `score` identity, so a stable JSON import means layout runs once per example.

import { Notation } from '@polyhymnia/notation-react';
import type { MnxDocument } from '@polyhymnia/notation-react';
import { ChordReveal, IntervalReveal, ScaleReveal } from '@polyhymnia/notation-react/presets';
import { NoteHeard, Dictation, ErrorDetection } from './exercises/index.js';
import { Example } from './Example.js';

import melody from './scores/melody.mnx.json';
import keyCMajor from './scores/key-c-major.mnx.json';
import keyGMajor from './scores/key-g-major.mnx.json';
import keyDMajor from './scores/key-d-major.mnx.json';
import keyFMajor from './scores/key-f-major.mnx.json';
import keyBbMajor from './scores/key-bb-major.mnx.json';
import clefTreble from './scores/clef-treble.mnx.json';
import clefBass from './scores/clef-bass.mnx.json';
import clefAlto from './scores/clef-alto.mnx.json';
import clefTenor from './scores/clef-tenor.mnx.json';
import wholeBarRest from './scores/whole-bar-rest.mnx.json';
import mixedRests from './scores/mixed-rests.mnx.json';
import ledgerLines from './scores/ledger-lines.mnx.json';
import underfull from './scores/underfull.mnx.json';
import rhythm44 from './scores/rhythm-4-4.mnx.json';
import rhythm68 from './scores/rhythm-6-8.mnx.json';
import triplets from './scores/triplets.mnx.json';
import twoVoices from './scores/two-voices.mnx.json';
import ties from './scores/ties.mnx.json';
import slurs from './scores/slurs.mnx.json';

const MELODY = melody as MnxDocument;
const WHOLE_BAR_REST = wholeBarRest as MnxDocument;
const MIXED_RESTS = mixedRests as MnxDocument;
const LEDGER_LINES = ledgerLines as MnxDocument;
const UNDERFULL = underfull as MnxDocument;
const RHYTHM_4_4 = rhythm44 as MnxDocument;
const RHYTHM_6_8 = rhythm68 as MnxDocument;
const TRIPLETS = triplets as MnxDocument;
const TWO_VOICES = twoVoices as MnxDocument;
const TIES = ties as MnxDocument;
const SLURS = slurs as MnxDocument;

const KEY_EXAMPLES: readonly { label: string; doc: MnxDocument }[] = [
  { label: 'C major — no accidentals', doc: keyCMajor as MnxDocument },
  { label: 'G major — 1 sharp', doc: keyGMajor as MnxDocument },
  { label: 'D major — 2 sharps', doc: keyDMajor as MnxDocument },
  { label: 'F major — 1 flat', doc: keyFMajor as MnxDocument },
  { label: 'B♭ major — 2 flats', doc: keyBbMajor as MnxDocument },
];

const CLEF_EXAMPLES: readonly { label: string; doc: MnxDocument }[] = [
  { label: 'Treble — top line F5', doc: clefTreble as MnxDocument },
  { label: 'Bass — top line A3', doc: clefBass as MnxDocument },
  { label: 'Alto — middle line C4', doc: clefAlto as MnxDocument },
  { label: 'Tenor — C4 on the fourth line', doc: clefTenor as MnxDocument },
];

// --- page -------------------------------------------------------------------

export function App() {
  return (
    <main>
      <h1>Polyhymnia notation — renderer gallery</h1>
      <p className="lede">
        Every stave below is <code>@polyhymnia/notation-engine</code>&rsquo;s{' '}
        <code>layoutScore()</code> rendered by <code>&lt;Notation&gt;</code>: SVG in staff-space
        units, glyphs from the subsetted Bravura build, no colour anywhere but the
        stylesheet. Beams and tuplet brackets are drawn, auto-grouped per the meter when a
        score doesn&rsquo;t specify <code>support.useBeams</code>; ties, slurs, second voices
        and every interactive affordance are later pipeline stages.
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
              duration={{ base: 'whole' }}
              onLayout={onLayout}
            />
          )}
        </Example>
        <Example title="D♭ major 7th" caption="ChordReveal — accidentals packed into columns">
          {(onLayout) => (
            <ChordReveal
              pitches={['Db4', 'F4', 'Ab4', 'C5']}
              clef="treble"
              duration={{ base: 'half' }}
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

      <h2>A melody, from a hand-written MNX file</h2>
      <p className="note">
        Four bars of 3/4 in F major, <code>src/scores/melody.mnx.json</code>: barlines, a
        final barline, dotted values, a rest mid-bar, and spacing/justification across the
        system.
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
          <Example key={c.label} title={c.label}>
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

      <h2>Beams and tuplets</h2>
      <p className="note">
        Beams are auto-grouped from the meter&rsquo;s beat structure; tuplet brackets are drawn
        from <code>type: &quot;tuplet&quot;</code> events.
      </p>
      <Example
        title="4/4 — 8ths, 16ths, dotted 8th+16th"
        caption="Mixed subdivisions beamed per beat"
      >
        {(onLayout) => <Notation score={RHYTHM_4_4} onLayout={onLayout} />}
      </Example>
      <Example
        title="6/8 — compound groupings"
        caption="Beam groups follow the dotted-quarter pulse, not straight beats"
      >
        {(onLayout) => <Notation score={RHYTHM_6_8} onLayout={onLayout} />}
      </Example>
      <Example
        title="Triplets"
        caption="Two beamed eighth-note triplets, then a quarter-note triplet"
      >
        {(onLayout) => <Notation score={TRIPLETS} onLayout={onLayout} />}
      </Example>

      <h2>Two voices</h2>
      <p className="note">
        A second sequence in a part lays out as a second voice on the same staff: voice 0
        stems up, voice 1 stems down; simultaneous rests offset apart; a second between the
        voices shifts the upper notehead right, a true unison overlaps.
      </p>
      <Example
        title="Two voices, one staff"
        caption="Beat 1: a second (v0 shifts right). Beat 2: a unison (no shift). Beat 3: simultaneous rests, offset apart. Beat 4: independent rhythm, per-voice beaming."
      >
        {(onLayout) => <Notation score={TWO_VOICES} onLayout={onLayout} />}
      </Example>

      <h2>Ties</h2>
      <p className="note">
        A tie curves opposite the stem for a single note; a chord ties each member
        separately, outer notes arching outward and inner notes following the nearest
        outer one.
      </p>
      <Example
        title="Ties across a barline and a chord"
        caption="Beat 2 ties into the next bar; the last bar's chord ties into a repeated chord"
      >
        {(onLayout) => <Notation score={TIES} onLayout={onLayout} />}
      </Example>

      <h2>Slurs</h2>
      <p className="note">
        A slur's direction follows MNX <code>side</code> when given, else the voice or the
        stems in its span; the arch raises to clear any notehead, stem, or beam sitting
        between its endpoints. <code>startNote</code> anchors it to a specific chord member.
      </p>
      <Example
        title="A phrase slur and a chord's startNote"
        caption="Bar 1: a slur over a four-note run. Bar 2: the slur starts from the chord's top note, not its default anchor"
      >
        {(onLayout) => <Notation score={SLURS} onLayout={onLayout} />}
      </Example>

      <h2>Diagnostics</h2>
      <p className="note">
        A malformed score degrades visibly instead of throwing. This bar holds one quarter
        note in 4/4; the engine pads it to length and attaches the warning below, which this
        page renders exactly as any app would.
      </p>
      <Example title="Underfull bar, auto-padded">
        {(onLayout) => <Notation score={UNDERFULL} onLayout={onLayout} />}
      </Example>

      <h2>Ear-training exercises</h2>
      <p className="note">
        Three exercises built on the answer-entry primitives: hit-testing through{' '}
        <code>Notation.Interaction</code>, per-note state through <code>Notation.Marks</code>,
        and document edits through <code>applyIntent</code>. All sound is generated by a tiny
        Web Audio oscillator in <code>apps/web</code> — the notation packages never produce audio.
      </p>
      <section className="exercises">
        <NoteHeard />
        <Dictation />
        <ErrorDetection />
      </section>

      <footer>
        Not rendered yet, and deliberately absent: slurs, and every interactive affordance —
        pointer hit-testing, the playback cursor and the
        <code> Notation.Interaction</code>/<code>Notation.Playback</code> compound children.
        Those land with the engine stages behind them.
      </footer>
    </main>
  );
}

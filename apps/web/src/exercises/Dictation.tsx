import { useCallback, useMemo, useState } from 'react';
import { Notation, applyIntent, parsePitch } from '@polyhymnia/notation-react';
import type { MnxDocument, NotationIntent, NoteId, Pitch, PreviewNote } from '@polyhymnia/notation-react';
import { midiOfPitch, playNotes } from './audio.js';
import score from '../scores/exercise-dictation.mnx.json';

const GIVEN_ID: NoteId = 'd1';
const ANSWERABLE: readonly NoteId[] = ['d2', 'd3', 'd4'];

const MELODY: readonly string[] = ['E4', 'G4', 'F#4', 'G4'];
const ANSWERS: Readonly<Record<NoteId, string>> = { d2: 'G4', d3: 'F#4', d4: 'G4' };

function withAlter(base: Pitch, alter: number | null): Pitch {
  const a = alter ?? base.alter ?? 0;
  return a === 0 ? { step: base.step, octave: base.octave } : { step: base.step, alter: a, octave: base.octave };
}

function samePitch(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && (a.alter ?? 0) === (b.alter ?? 0) && a.octave === b.octave;
}

export function Dictation() {
  const [doc, setDoc] = useState<MnxDocument>(score as MnxDocument);
  const [entered, setEntered] = useState<Readonly<Record<NoteId, Pitch>>>({});
  const [alterMode, setAlterMode] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewNote | null>(null);
  const [checked, setChecked] = useState(false);

  const states = useMemo<Readonly<Record<NoteId, string>>>(() => {
    const result: Record<NoteId, string> = { [GIVEN_ID]: 'given' };
    if (checked) {
      for (const id of ANSWERABLE) {
        const answer = ANSWERS[id];
        const answerPitch = answer === undefined ? undefined : parsePitch(answer);
        const enteredPitch = entered[id];
        result[id] = enteredPitch !== undefined && answerPitch !== undefined && samePitch(enteredPitch, answerPitch)
          ? 'correct'
          : 'incorrect';
      }
    }
    return result;
  }, [checked, entered]);

  const play = useCallback(() => {
    playNotes(
      MELODY.map((pitch, i) => ({
        midi: midiOfPitch(parsePitch(pitch)),
        startSeconds: i * 0.5,
        durationSeconds: 0.45,
      })),
    );
  }, []);

  const reset = useCallback(() => {
    setDoc(score as MnxDocument);
    setEntered({});
    setAlterMode(null);
    setPreview(null);
    setChecked(false);
  }, []);

  const onIntent = useCallback(
    (intent: NotationIntent) => {
      if (intent.type === 'hover') {
        if (!intent.target || intent.target.kind !== 'slot') {
          setPreview(null);
          return;
        }
        const slot = intent.target.slot;
        if (slot.eventId === GIVEN_ID) {
          setPreview(null);
          return;
        }
        setPreview({
          measureIndex: slot.measureIndex,
          x: slot.x,
          pitch: withAlter(intent.target.pitch, alterMode),
          voice: slot.voice,
        });
        return;
      }
      if (intent.target.kind !== 'slot') return;
      const slot = intent.target.slot;
      const eventId = slot.eventId;
      if (eventId === GIVEN_ID) return;
      const pitch = withAlter(intent.target.pitch, alterMode);
      const current = entered[eventId];
      const clearing = current !== undefined && samePitch(current, pitch);
      const result = applyIntent(doc, { type: 'setPitches', event: eventId, pitches: clearing ? [] : [pitch] });
      setDoc(result.doc);
      setEntered((prev) => {
        const next = { ...prev };
        if (clearing) delete next[eventId];
        else next[eventId] = pitch;
        return next;
      });
      setAlterMode(null);
      setChecked(false);
    },
    [alterMode, entered, doc],
  );

  return (
    <section className="exercise">
      <h3>Melodic dictation</h3>
      <p className="caption">
        The first note is given. Click a rest slot at the staff position you hear, then
        check. Use ♯/♮/♭ for an accidental before clicking.
      </p>
      <div className="exercise-controls">
        <button type="button" onClick={play}>Play</button>
        <button type="button" onClick={() => setChecked(true)}>Check</button>
        <button type="button" onClick={reset}>Reset</button>
        <span className="alter-buttons" role="group" aria-label="Accidental">
          <button type="button" aria-pressed={alterMode === -1} onClick={() => setAlterMode(-1)}>♭</button>
          <button type="button" aria-pressed={alterMode === 0} onClick={() => setAlterMode(0)}>♮</button>
          <button type="button" aria-pressed={alterMode === 1} onClick={() => setAlterMode(1)}>♯</button>
        </span>
      </div>
      <Notation score={doc}>
        <Notation.Interaction targets={['slot']} onIntent={onIntent} />
        <Notation.Marks states={states} preview={preview} />
      </Notation>
      <p className="exercise-feedback" role="status">
        {checked
          ? ANSWERABLE.map((id, i) => {
              const e = entered[id];
              const got = e ? `${e.step}${e.alter === 1 ? '♯' : e.alter === -1 ? '♭' : ''}${e.octave}` : '—';
              return `Note ${i + 2}: ${got} (${states[id] === 'correct' ? 'correct' : `answer ${ANSWERS[id]}`})`;
            }).join(' · ')
          : 'Fill the empty slots, then press Check.'}
      </p>
    </section>
  );
}

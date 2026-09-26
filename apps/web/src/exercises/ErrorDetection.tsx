import { useCallback, useMemo, useState } from 'react';
import { Notation, parsePitch } from '@polyhymnia/notation-react';
import type { MnxDocument, NotationIntent, NoteId } from '@polyhymnia/notation-react';
import { midiOfPitch, playNotes } from './audio.js';
import score from '../scores/exercise-error-detection.mnx.json';

const NOTES: readonly { id: NoteId; pitch: string }[] = [
  { id: 'e1', pitch: 'C4' },
  { id: 'e2', pitch: 'E4' },
  { id: 'e3', pitch: 'G4' },
  { id: 'e4', pitch: 'C5' },
];

const VARIANT: readonly string[] = ['C4', 'F4', 'A4', 'C5'];
const CHANGED: ReadonlySet<NoteId> = new Set(['e2', 'e3']);

const PROMPT = 'Play sounds a version with two wrong notes. Select every note you think changed, then Check.';

export function ErrorDetection() {
  const [selection, setSelection] = useState<readonly NoteId[]>([]);
  const [checked, setChecked] = useState(false);

  const { states, feedback } = useMemo(() => {
    if (!checked) return { states: {} as Readonly<Record<NoteId, string>>, feedback: PROMPT };
    const states: Record<NoteId, string> = {};
    let found = 0;
    let wrong = 0;
    for (const note of NOTES) {
      const isChanged = CHANGED.has(note.id);
      const isSelected = selection.includes(note.id);
      if (isChanged) {
        if (isSelected) {
          states[note.id] = 'correct';
          found += 1;
        } else {
          states[note.id] = 'missed';
        }
      } else if (isSelected) {
        states[note.id] = 'incorrect';
        wrong += 1;
      }
    }
    const feedback =
      found === CHANGED.size && wrong === 0
        ? 'Perfect — both changed notes found.'
        : `Found ${found} of ${CHANGED.size} changed notes${wrong ? `, with ${wrong} wrong pick${wrong === 1 ? '' : 's'}` : ''}.`;
    return { states, feedback };
  }, [checked, selection]);

  const play = useCallback(() => {
    playNotes(
      VARIANT.map((pitch, i) => ({
        midi: midiOfPitch(parsePitch(pitch)),
        startSeconds: i * 0.5,
        durationSeconds: 0.45,
      })),
    );
  }, []);

  const onIntent = useCallback((intent: NotationIntent) => {
    if (intent.type !== 'activate' || intent.target.kind !== 'element') return;
    const id = intent.target.id;
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setChecked(false);
  }, []);

  return (
    <section className="exercise">
      <h3>Error detection</h3>
      <p className="caption">
        The printed melody is correct. Play sounds a version with two changed pitches;
        click the notes you think differ.
      </p>
      <div className="exercise-controls">
        <button type="button" onClick={play}>Play</button>
        <button type="button" onClick={() => setChecked(true)}>Check</button>
        <button type="button" onClick={() => { setSelection([]); setChecked(false); }}>Reset</button>
      </div>
      <Notation score={score as MnxDocument}>
        <Notation.Interaction targets={['element']} onIntent={onIntent} />
        <Notation.Marks states={states} selection={selection} />
      </Notation>
      <p className="exercise-feedback" role="status">{feedback}</p>
    </section>
  );
}

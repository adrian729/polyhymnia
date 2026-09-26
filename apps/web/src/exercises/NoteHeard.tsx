import { useCallback, useState } from 'react';
import { Notation, parsePitch } from '@polyhymnia/notation-react';
import type { MnxDocument, NotationIntent, NoteId } from '@polyhymnia/notation-react';
import { midiOfPitch, playNotes } from './audio.js';
import score from '../scores/exercise-note-heard.mnx.json';

const NOTES: readonly { id: NoteId; pitch: string }[] = [
  { id: 'n1', pitch: 'C4' },
  { id: 'n2', pitch: 'D4' },
  { id: 'n3', pitch: 'E4' },
  { id: 'n4', pitch: 'F4' },
  { id: 'n5', pitch: 'G4' },
];

const PROMPT = 'Press "Play", then click the note you heard.';

function playPitch(pitch: string, durationSeconds = 0.6): void {
  playNotes([{ midi: midiOfPitch(parsePitch(pitch)), startSeconds: 0, durationSeconds }]);
}

export function NoteHeard() {
  const [picked, setPicked] = useState<NoteId | null>(null);
  const [states, setStates] = useState<Readonly<Record<NoteId, string>>>({});
  const [hoverToHear, setHoverToHear] = useState(false);
  const [message, setMessage] = useState(PROMPT);

  const play = useCallback(() => {
    if (picked === null) {
      const note = NOTES[Math.floor(Math.random() * NOTES.length)]!;
      setPicked(note.id);
      setStates({});
      setMessage('Which note did you hear?');
      playPitch(note.pitch);
      return;
    }
    const note = NOTES.find((n) => n.id === picked);
    if (note) playPitch(note.pitch);
  }, [picked]);

  const next = useCallback(() => {
    const pool = NOTES.filter((n) => n.id !== picked);
    const note = pool[Math.floor(Math.random() * pool.length)] ?? NOTES[0]!;
    setPicked(note.id);
    setStates({});
    setMessage('Which note did you hear?');
    playPitch(note.pitch);
  }, [picked]);

  const onIntent = useCallback(
    (intent: NotationIntent) => {
      if (intent.type === 'hover') {
        if (hoverToHear && intent.target?.kind === 'element' && intent.target.pitch) {
          playNotes([{ midi: midiOfPitch(intent.target.pitch), startSeconds: 0, durationSeconds: 0.35 }]);
        }
        return;
      }
      if (intent.target.kind !== 'element' || picked === null) return;
      const id = intent.target.id;
      if (id === picked) {
        setStates({ [id]: 'correct' });
        setMessage('Correct!');
      } else {
        setStates({ [id]: 'incorrect' });
        const pitch = NOTES.find((n) => n.id === picked)?.pitch ?? '';
        setMessage(`Incorrect — that was ${pitch}.`);
      }
    },
    [hoverToHear, picked],
  );

  return (
    <section className="exercise">
      <h3>Click the note you heard</h3>
      <p className="caption">A five-note melody. Play sounds one note; click the one you heard.</p>
      <div className="exercise-controls">
        <button type="button" onClick={play}>Play</button>
        <button type="button" onClick={next}>Next</button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hoverToHear}
            onChange={(event) => setHoverToHear(event.target.checked)}
          />
          Hover to hear
        </label>
      </div>
      <Notation score={score as MnxDocument}>
        <Notation.Interaction targets={['element']} onIntent={onIntent} />
        <Notation.Marks states={states} />
      </Notation>
      <p className="exercise-feedback" role="status">{message}</p>
    </section>
  );
}

import type { Pitch } from '@polyhymnia/notation-react';

export interface TimedNote {
  midi: number;
  startSeconds: number;
  durationSeconds: number;
}

const STEP_SEMITONES: Readonly<Record<Pitch['step'], number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function midiOfPitch(pitch: Pitch): number {
  return 12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

let context: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!context) context = new AudioContext();
  return context;
}

export function playNotes(notes: readonly TimedNote[]): void {
  const ctx = audioContext();
  void ctx.resume();
  const now = ctx.currentTime;
  for (const note of notes) playTone(ctx, note.midi, now + note.startSeconds, note.durationSeconds);
}

function playTone(ctx: AudioContext, midi: number, when: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), when);

  const attack = 0.01;
  const release = 0.06;
  const hold = Math.max(duration - attack - release, 0);
  const end = when + attack + hold + release;

  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.35, when + attack);
  gain.gain.setValueAtTime(0.35, when + attack + hold);
  gain.gain.linearRampToValueAtTime(0, end);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(end + 0.05);
}

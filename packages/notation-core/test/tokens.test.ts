import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  formatDuration,
  formatPitch,
  isDurationToken,
  isPitchToken,
  note,
  parseDuration,
  parsePitch,
} from '../src/build/index.js';
import { durationToTicks } from '../src/model/duration.js';
import { midiOf } from '../src/model/pitch.js';
import { DEFAULT_DIVISIONS, type Pitch } from '../src/model/types.js';

describe('pitch tokens', () => {
  it('parses letter, accidental and octave', () => {
    expect(parsePitch('C4')).toEqual({ step: 0, alter: 0, octave: 4 });
    expect(parsePitch('F#5')).toEqual({ step: 3, alter: 1, octave: 5 });
    expect(parsePitch('Bb3')).toEqual({ step: 6, alter: -1, octave: 3 });
    expect(parsePitch('Gbb2')).toEqual({ step: 4, alter: -2, octave: 2 });
    expect(parsePitch('D##-1')).toEqual({ step: 1, alter: 2, octave: -1 });
  });

  it('keeps C4 at MIDI 60 and leaves alter off the staff position', () => {
    expect(midiOf(parsePitch('C4'))).toBe(60);
    expect(parsePitch('F#5').step).toBe(parsePitch('F5').step);
  });

  it('passes an already-constructed Pitch straight through', () => {
    const pitch: Pitch = { step: 2, alter: -1, octave: 4 };
    expect(parsePitch(pitch)).toEqual(pitch);
  });

  it('rejects junk', () => {
    expect(() => parsePitch('H4' as never)).toThrow();
    expect(() => parsePitch('C' as never)).toThrow();
    expect(() => parsePitch('C#b4' as never)).toThrow();
    expect(isPitchToken('C4')).toBe(true);
    expect(isPitchToken('X9')).toBe(false);
  });

  it('round-trips every pitch through its token form', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: -2, max: 2 }),
        fc.integer({ min: -2, max: 9 }),
        (step, alter, octave) => {
          const pitch = { step, alter, octave } as Pitch;
          expect(parsePitch(formatPitch(pitch))).toEqual(pitch);
        },
      ),
    );
  });
});

describe('duration tokens', () => {
  it('maps every base letter', () => {
    expect(parseDuration('b')).toEqual({ base: 'breve', dots: 0 });
    expect(parseDuration('w')).toEqual({ base: 'whole', dots: 0 });
    expect(parseDuration('h')).toEqual({ base: 'half', dots: 0 });
    expect(parseDuration('q')).toEqual({ base: 'quarter', dots: 0 });
    expect(parseDuration('8')).toEqual({ base: 'eighth', dots: 0 });
    expect(parseDuration('16')).toEqual({ base: '16th', dots: 0 });
    expect(parseDuration('32')).toEqual({ base: '32nd', dots: 0 });
    expect(parseDuration('64')).toEqual({ base: '64th', dots: 0 });
  });

  it('counts dots', () => {
    expect(parseDuration('q.')).toEqual({ base: 'quarter', dots: 1 });
    expect(parseDuration('8..')).toEqual({ base: 'eighth', dots: 2 });
  });

  it('applies dots as half the previous increment', () => {
    const d = DEFAULT_DIVISIONS;
    expect(durationToTicks(parseDuration('q'), d)).toBe(3360);
    expect(durationToTicks(parseDuration('q.'), d)).toBe(5040);
    expect(durationToTicks(parseDuration('q..'), d)).toBe(5880);
    expect(durationToTicks(parseDuration('w'), d)).toBe(13440);
    expect(durationToTicks(parseDuration('b'), d)).toBe(26880);
    expect(durationToTicks(parseDuration('64'), d)).toBe(210);
  });

  it('rejects junk', () => {
    expect(() => parseDuration('x' as never)).toThrow();
    expect(() => parseDuration('q...' as never)).toThrow();
    expect(() => parseDuration('4' as never)).toThrow();
    expect(isDurationToken('16.')).toBe(true);
    expect(isDurationToken('4')).toBe(false);
  });

  it('round-trips every {base, dots} through its token form', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('b', 'w', 'h', 'q', '8', '16', '32', '64' as const),
        fc.constantFrom('', '.', '..' as const),
        (base, dots) => {
          const token = `${base}${dots}`;
          expect(formatDuration(parseDuration(token as never))).toBe(token);
        },
      ),
    );
  });
});

describe('builders accept both token and object forms', () => {
  it('produces identical elements either way', () => {
    const fromTokens = note('Eb4', 'q.');
    const fromObjects = note({ step: 2, alter: -1, octave: 4 }, { base: 'quarter', dots: 1 });
    expect(fromTokens.pitch).toEqual(fromObjects.pitch);
    expect(fromTokens.duration).toEqual(fromObjects.duration);
    expect(fromTokens.id).not.toBe(fromObjects.id);
  });
});

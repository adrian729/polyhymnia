import { describe, expect, it } from 'vitest';
import { parsePitch } from '../src/mnx/pitch.js';

describe('parsePitch', () => {
  it('parses letter, accidental and octave', () => {
    expect(parsePitch('C4')).toEqual({ step: 'C', octave: 4 });
    expect(parsePitch('F#5')).toEqual({ step: 'F', alter: 1, octave: 5 });
    expect(parsePitch('Bb3')).toEqual({ step: 'B', alter: -1, octave: 3 });
    expect(parsePitch('F##5')).toEqual({ step: 'F', alter: 2, octave: 5 });
    expect(parsePitch('Gbb2')).toEqual({ step: 'G', alter: -2, octave: 2 });
  });

  it('omits alter when 0', () => {
    const pitch = parsePitch('D4');
    expect(pitch).not.toHaveProperty('alter');
  });

  it('is case-insensitive on the letter, case-sensitive on the accidental', () => {
    expect(parsePitch('c4')).toEqual({ step: 'C', octave: 4 });
    expect(() => parsePitch('CB4')).toThrow();
  });

  it('rejects junk', () => {
    expect(() => parsePitch('H4')).toThrow();
    expect(() => parsePitch('C')).toThrow();
    expect(() => parsePitch('C#b4')).toThrow();
  });
});

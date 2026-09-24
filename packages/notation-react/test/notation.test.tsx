import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutScore, measure, note, rest, score } from '@earmaster/notation-core';
import type { NoteId } from '@earmaster/notation-core';
import { Notation } from '../src/Notation.js';
import type { NotationHandle } from '../src/Notation.js';
import { ScaleReveal } from '../src/presets/ScaleReveal.js';
import { scalePitches, fittingMeter } from '../src/presets/shared.js';
import { parsePitch } from '@earmaster/notation-core';

afterEach(cleanup);

const TREBLE_CLEF = 0xe050;
const NOTEHEAD_BLACK = 0xe0a4;

function simpleScore() {
  return score(
    { clef: 'treble' },
    measure(note('C4', 'q'), note('E4', 'q'), note('G4', 'h')),
    measure(note('A5', 'q'), rest('q'), note('C3', 'h')),
  );
}

describe('<Notation>', () => {
  it('renders one <svg> with the sp-unit viewBox layout reports', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const { container } = render(<Notation score={doc} />);
    const svg = container.querySelector('svg')!;

    expect(svg.getAttribute('viewBox')).toBe(
      `${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.w} ${layout.viewBox.h}`,
    );
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.classList.contains('em-notation')).toBe(true);
  });

  it('summarizes the score in the root aria-label', () => {
    const { container } = render(<Notation score={simpleScore()} />);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe(
      'Music notation: 2 measures, 5 notes, 1 rest',
    );
  });

  it('emits one <text> per notehead at the codepoint and coordinates layout computed', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const { container } = render(<Notation score={doc} />);

    const heads = [...container.querySelectorAll('[data-em="notehead"]')];
    const expected = layout.glyphs.filter((g) => g.cls === 'notehead');
    expect(heads).toHaveLength(expected.length);
    expect(expected).not.toHaveLength(0);

    heads.forEach((head, i) => {
      const g = expected[i]!;
      expect(head.tagName.toLowerCase()).toBe('text');
      expect(head.getAttribute('x')).toBe(String(g.x));
      expect(head.getAttribute('y')).toBe(String(g.y));
      expect(head.textContent).toBe(String.fromCodePoint(g.cp));
      expect(head.getAttribute('fill')).toBe('currentColor');
    });

    // The quarter notes really carry the black notehead codepoint, and the clef the
    // treble glyph — not an arbitrary character that happens to be there.
    expect(heads[0]!.textContent!.codePointAt(0)).toBe(NOTEHEAD_BLACK);
    expect(
      container.querySelector('[data-em="clef"]')!.textContent!.codePointAt(0),
    ).toBe(TREBLE_CLEF);
  });

  it('wraps each element in a <g> labelled from ElementBox.label', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const { container } = render(<Notation score={doc} />);

    const groups = [...container.querySelectorAll('[data-em="element"]')];
    expect(groups.length).toBe(Object.keys(layout.elements).length);
    for (const group of groups) {
      const id = group.getAttribute('data-em-el') as NoteId;
      expect(group.getAttribute('aria-label')).toBe(layout.elements[id]!.label);
    }
    expect(groups[0]!.getAttribute('aria-label')).toBe('C 4, quarter note, measure 1');
  });

  it('draws the five staff lines and the barlines as rects, never with a hardcoded color', () => {
    const { container } = render(<Notation score={simpleScore()} />);
    const lines = [...container.querySelectorAll('[data-em="staff-line"]')];
    expect(lines).toHaveLength(5);
    expect(container.querySelectorAll('[data-em="barline"]').length).toBeGreaterThan(0);
    for (const node of container.querySelectorAll('svg *')) {
      const fill = node.getAttribute('fill');
      expect(fill === null || fill === 'currentColor').toBe(true);
    }
  });

  it('calls onLayout with the memoized layout', () => {
    const seen: unknown[] = [];
    render(<Notation score={simpleScore()} onLayout={(l) => seen.push(l)} />);
    expect(seen).toHaveLength(1);
    expect((seen[0] as { version: number }).version).toBe(1);
  });

  it('merges className and style onto the svg', () => {
    const { container } = render(
      <Notation score={simpleScore()} className="wide" style={{ width: '400px' }} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toBe('em-notation wide');
    expect(svg.style.width).toBe('400px');
  });
});

describe('NotationHandle', () => {
  it('exposes layout, timemap and SVG export, and throws for the unbuilt methods', () => {
    const ref = createRef<NotationHandle>();
    render(<Notation score={simpleScore()} ref={ref} />);
    const handle = ref.current!;

    expect(handle.getLayout().version).toBe(1);
    expect(handle.getTimeMap().entries.length).toBeGreaterThan(0);

    const svg = handle.exportSVG();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('http://www.w3.org/2000/svg');

    expect(() => handle.hitTest({ x: 0, y: 0 })).toThrow(/not implemented yet/);
    expect(() => handle.setPlaybackTick(0)).toThrow(/roadmap/);
    expect(() => handle.animateCursor(null)).toThrow(/roadmap/);
    expect(() => handle.focus('n1' as never)).toThrow(/roadmap/);
  });
});

describe('scale spelling', () => {
  const names = (root: string, scale: Parameters<typeof scalePitches>[1], desc = false) =>
    scalePitches(parsePitch(root as never), scale, desc).map(
      (p) => 'CDEFGAB'[p.step]! + (p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter)) + p.octave,
    );

  it('spells the major scale with one letter per degree', () => {
    expect(names('D4', 'major')).toEqual([
      'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5',
    ]);
  });

  it('raises only the 7th in harmonic minor', () => {
    expect(names('A3', 'harmonicMinor')).toEqual([
      'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A4',
    ]);
  });

  it('uses the classical descending form for melodic minor', () => {
    expect(names('A3', 'melodicMinor')).toEqual([
      'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G#4', 'A4',
    ]);
    // Natural-minor pitch content, top down — F natural and G natural, not F#/G#.
    expect(names('A3', 'melodicMinor', true)).toEqual([
      'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3',
    ]);
  });

  it('reverses the same pitch set for every other scale', () => {
    expect(names('C4', 'major', true)).toEqual(names('C4', 'major').reverse());
  });
});

describe('presets', () => {
  it('fits the meter to the content so no padding rest is invented', () => {
    expect(fittingMeter('q', 8)).toEqual({ beats: 8, beatType: 4 });
    expect(fittingMeter('8', 8)).toEqual({ beats: 4, beatType: 4 });
    expect(fittingMeter('q', 1)).toEqual({ beats: 1, beatType: 4 });
  });

  it('renders a full octave, one notehead per degree', () => {
    const { container } = render(
      <ScaleReveal root="A3" scale="melodicMinor" clef="bass" descending />,
    );
    expect(container.querySelectorAll('[data-em="notehead"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-em="rest"]')).toHaveLength(0);
  });
});

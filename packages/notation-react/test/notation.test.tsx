import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutScore } from '@polyhymnia/notation-engine';
import { parsePitch } from '@polyhymnia/notation-model';
import type { Event, MnxDocument, NoteValue } from '@polyhymnia/notation-model';
import { Notation } from '../src/Notation.js';
import type { NotationHandle } from '../src/Notation.js';
import type { PlaybackView } from '../src/Notation.js';
import { ScaleReveal } from '../src/presets/ScaleReveal.js';
import { scalePitches, fittingMeter } from '../src/presets/shared.js';

afterEach(cleanup);

const TREBLE_CLEF = 0xe050;
const NOTEHEAD_BLACK = 0xe0a4;

const QUARTER: NoteValue = { base: 'quarter' };
const HALF: NoteValue = { base: 'half' };

function noteEvent(pitch: string, duration: NoteValue): Event {
  return { duration, notes: [{ pitch: parsePitch(pitch) }] };
}

function restEvent(duration: NoteValue): Event {
  return { duration, rest: {} };
}

function simpleScore(): MnxDocument {
  return {
    mnx: { version: 1 },
    global: {
      measures: [{ time: { count: 4, unit: 4 } }, {}],
    },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
            sequences: [{ content: [noteEvent('C4', QUARTER), noteEvent('E4', QUARTER), noteEvent('G4', HALF)] }],
          },
          {
            sequences: [{ content: [noteEvent('A5', QUARTER), restEvent(QUARTER), noteEvent('C3', HALF)] }],
          },
        ],
      },
    ],
  };
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
    expect(svg.classList.contains('pn-notation')).toBe(true);
  });

  it('emits one <text> per notehead at the codepoint and coordinates layout computed', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const { container } = render(<Notation score={doc} />);

    const heads = [...container.querySelectorAll('[data-pn="notehead"]')];
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

    expect(heads[0]!.textContent!.codePointAt(0)).toBe(NOTEHEAD_BLACK);
    expect(
      container.querySelector('[data-pn="clef"]')!.textContent!.codePointAt(0),
    ).toBe(TREBLE_CLEF);
  });

  it('wraps each element in a <g> labelled from ElementBox.label', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const { container } = render(<Notation score={doc} />);

    const groups = [...container.querySelectorAll('[data-pn="element"]')];
    expect(groups.length).toBe(Object.keys(layout.elements).length);
    for (const group of groups) {
      const id = group.getAttribute('data-pn-el')!;
      expect(group.getAttribute('aria-label')).toBe(layout.elements[id]!.label);
    }
    expect(groups[0]!.getAttribute('aria-label')).toBe('C 4, quarter note, measure 1');
  });

});

describe('NotationHandle', () => {
  it('exposes layout, timemap, SVG export and hitTest; throws only for the unbuilt cursor', () => {
    const ref = createRef<NotationHandle>();
    render(<Notation score={simpleScore()} ref={ref} />);
    const handle = ref.current!;

    expect(handle.getLayout().version).toBe(1);
    expect(handle.getTimeMap().entries.length).toBeGreaterThan(0);

    const svg = handle.exportSVG();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('http://www.w3.org/2000/svg');

    expect(handle.hitTest({ x: -1000, y: -1000 })).toBeNull();
    expect(() => handle.animateCursor(null)).toThrow(/roadmap/);
    expect(() => handle.focus('n1')).not.toThrow();
    expect(() => handle.setPlaybackTick(0)).not.toThrow();
  });
});

function beamAndTieScore(): MnxDocument {
  return {
    mnx: { version: 1 },
    global: { measures: [{ time: { count: 4, unit: 4 } }] },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
            sequences: [
              {
                content: [
                  { duration: { base: 'eighth' }, notes: [{ pitch: parsePitch('C4'), id: 'bn1' }] },
                  { duration: { base: 'eighth' }, notes: [{ pitch: parsePitch('D4'), id: 'bn2' }] },
                  {
                    duration: { base: 'quarter' },
                    notes: [{ pitch: parsePitch('E4'), id: 'bn3', ties: [{ target: 'bn4' }] }],
                  },
                  { duration: { base: 'quarter' }, notes: [{ pitch: parsePitch('E4'), id: 'bn4' }] },
                  restEvent(QUARTER),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('playback highlighting', () => {
  it('mode "notes" sets data-pn-playing on exactly the given ids', () => {
    const doc = beamAndTieScore();
    const { container } = render(
      <Notation score={doc}>
        <Notation.Playback view={{ mode: 'notes', activeIds: ['bn1', 'bn3'] }} />
      </Notation>,
    );

    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn1"]')?.getAttribute('data-pn-playing')).toBe('true');
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn3"]')?.getAttribute('data-pn-playing')).toBe('true');
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn2"]')?.hasAttribute('data-pn-playing')).toBe(false);
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn4"]')?.hasAttribute('data-pn-playing')).toBe(false);
  });

  it('setPlaybackTick highlights exactly the notes sounding at a tick, via the timemap', () => {
    const doc = beamAndTieScore();
    const ref = createRef<NotationHandle>();
    const { container } = render(<Notation score={doc} ref={ref} />);
    const handle = ref.current!;
    const timemap = handle.getTimeMap();

    handle.setPlaybackTick(timemap.byId('bn1')!.tick + 10);
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn1"]')?.getAttribute('data-pn-playing')).toBe('true');
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn2"]')?.hasAttribute('data-pn-playing')).toBe(false);

    const bn3 = timemap.byId('bn3')!;
    handle.setPlaybackTick(bn3.tick + bn3.durationTicks - 10);
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn4"]')?.getAttribute('data-pn-playing')).toBe('true');
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn3"]')?.hasAttribute('data-pn-playing')).toBe(false);
    expect(container.querySelector('g[data-pn="element"][data-pn-el="bn1"]')?.hasAttribute('data-pn-playing')).toBe(false);
  });

  it('reapplies highlights when the score re-lays out and the highlighted element gets a new DOM node', () => {
    const oneNote: MnxDocument = {
      mnx: { version: 1 },
      global: { measures: [{ time: { count: 4, unit: 4 } }] },
      parts: [
        {
          measures: [
            {
              clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
              sequences: [{ content: [{ duration: { base: 'quarter' }, notes: [{ pitch: parsePitch('C4'), id: 'x' }] }] }],
            },
          ],
        },
      ],
    };
    const twoNotes: MnxDocument = {
      ...oneNote,
      parts: [
        {
          measures: [
            {
              clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
              sequences: [
                {
                  content: [
                    { duration: { base: 'quarter' }, notes: [{ pitch: parsePitch('D4'), id: 'y' }] },
                    { duration: { base: 'quarter' }, notes: [{ pitch: parsePitch('C4'), id: 'x' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const view: PlaybackView = { mode: 'notes', activeIds: ['x'] };
    const { container, rerender } = render(
      <Notation score={oneNote}>
        <Notation.Playback view={view} />
      </Notation>,
    );
    expect(container.querySelector('g[data-pn="element"][data-pn-el="x"]')?.getAttribute('data-pn-playing')).toBe('true');

    rerender(
      <Notation score={twoNotes}>
        <Notation.Playback view={view} />
      </Notation>,
    );
    expect(container.querySelector('g[data-pn="element"][data-pn-el="x"]')?.getAttribute('data-pn-playing')).toBe('true');
  });
});

describe('scale spelling', () => {
  const names = (root: string, scale: Parameters<typeof scalePitches>[1], desc = false) =>
    scalePitches(parsePitch(root), scale, desc).map(
      (p) => p.step + (p.alter ? (p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter)) : '') + p.octave,
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
    expect(fittingMeter(QUARTER, 8)).toEqual({ count: 8, unit: 4 });
    expect(fittingMeter({ base: 'eighth' }, 8)).toEqual({ count: 4, unit: 4 });
    expect(fittingMeter(QUARTER, 1)).toEqual({ count: 1, unit: 4 });
  });

});

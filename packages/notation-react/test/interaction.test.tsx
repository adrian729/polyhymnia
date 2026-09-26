import { createRef } from 'react';
import { StrictMode } from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutScore, STAFF_HEIGHT, previewShapes } from '@polyhymnia/notation-engine';
import type { HitResult } from '@polyhymnia/notation-engine';
import { parsePitch } from '@polyhymnia/notation-model';
import type { Event, MnxDocument, NoteValue } from '@polyhymnia/notation-model';
import { Notation } from '../src/Notation.js';
import type { NotationHandle } from '../src/Notation.js';
import type { NotationIntent } from '../src/Interaction.js';

afterEach(cleanup);

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const QUARTER: NoteValue = { base: 'quarter' };
const HALF: NoteValue = { base: 'half' };

function noteEvent(pitch: string, duration: NoteValue): Event {
  return { duration: { ...duration }, notes: [{ pitch: parsePitch(pitch) }] };
}

function simpleScore(): MnxDocument {
  return {
    mnx: { version: 1 },
    global: { measures: [{ time: { count: 4, unit: 4 } }] },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
            sequences: [{ content: [noteEvent('C4', QUARTER), noteEvent('E4', QUARTER), noteEvent('G4', HALF)] }],
          },
        ],
      },
    ],
  };
}

function keyScore(): MnxDocument {
  return {
    mnx: { version: 1 },
    global: { measures: [{ time: { count: 4, unit: 4 }, key: { fifths: 2 } }] },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
            sequences: [{ content: [{ duration: { base: 'whole' }, rest: {} }] }],
          },
        ],
      },
    ],
  };
}

function twoVoiceScore(): MnxDocument {
  return {
    mnx: { version: 1 },
    global: { measures: [{ time: { count: 4, unit: 4 } }] },
    parts: [
      {
        measures: [
          {
            clefs: [{ clef: { sign: 'G', staffPosition: -2 } }],
            sequences: [
              { content: [noteEvent('E4', HALF), noteEvent('G4', HALF)] },
              { content: [noteEvent('C4', HALF), noteEvent('C4', HALF)] },
            ],
          },
        ],
      },
    ],
  };
}

function stubGeometry(svg: SVGSVGElement): void {
  (svg as unknown as { getScreenCTM: () => DOMMatrix }).getScreenCTM = () =>
    ({ inverse: () => ({}) }) as unknown as DOMMatrix;
  (svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
    const point = {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: point.x, y: point.y };
      },
    };
    return point as unknown as DOMPoint;
  };
}

describe('<Notation.Interaction>', () => {
  it('emits activate with kind slot on a slot click', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const slot = layout.slots[0]!;
    const system = layout.systems[0]!;
    const intents: NotationIntent[] = [];
    const { container } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['slot']} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );
    const svg = container.querySelector('svg')!;
    stubGeometry(svg);
    fireEvent.click(svg, { clientX: slot.x + slot.w / 2, clientY: system.y + STAFF_HEIGHT / 2 });

    expect(intents).toHaveLength(1);
    const target = intents[0]!.target as Extract<HitResult, { kind: 'slot' }>;
    expect(intents[0]!.type).toBe('activate');
    expect(target.kind).toBe('slot');
    expect(target.slot.eventId).toBe(slot.eventId);
    expect(target.pitch).toBeDefined();
  });

  it('emits nothing and renders no overlay/tabIndex with targets: []', () => {
    const doc = simpleScore();
    const intents: NotationIntent[] = [];
    const { container } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={[]} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );
    const svg = container.querySelector('svg')!;
    stubGeometry(svg);
    fireEvent.click(svg, { clientX: 0, clientY: 0 });

    expect(intents).toHaveLength(0);
    expect(container.querySelector('[data-pn="hit-overlay"]')).toBeNull();
    expect(container.querySelector('[data-pn="element"][tabindex]')).toBeNull();
  });

  it('dedupes hover by hit identity and fires null on leave', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const boxes = Object.values(layout.elements);
    const a = boxes[0]!;
    const b = boxes[1]!;
    const intents: NotationIntent[] = [];
    const { container } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['element']} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );
    const svg = container.querySelector('svg')!;
    stubGeometry(svg);

    const center = (box: typeof a) => ({
      clientX: box.hitBox.x + box.hitBox.w / 2,
      clientY: box.hitBox.y + box.hitBox.h / 2,
    });

    fireEvent.pointerMove(svg, center(a));
    fireEvent.pointerMove(svg, center(a));
    fireEvent.pointerMove(svg, center(b));
    fireEvent.pointerLeave(svg);

    const hovers = intents.filter((i) => i.type === 'hover');
    expect(hovers).toHaveLength(3);
    expect(hovers[2]!.target).toBeNull();
  });

  it('threads options.accidentals.insertAlteration into pointer and keyboard hitTest', () => {
    const doc = keyScore();
    const layout = layoutScore(doc);
    const system = layout.systems[0]!;
    const point = { clientX: layout.measures[0]!.contentX, clientY: system.y };

    const keyedIntents: NotationIntent[] = [];
    const { container: keyedContainer } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['point']} onIntent={(i) => keyedIntents.push(i)} />
      </Notation>,
    );
    const keyedSvg = keyedContainer.querySelector('svg')!;
    stubGeometry(keyedSvg);
    fireEvent.click(keyedSvg, point);
    const keyedTarget = keyedIntents[0]!.target as Extract<HitResult, { kind: 'point' }>;
    expect(keyedTarget.pitch).toEqual({ step: 'F', octave: 5, alter: 1 });

    const naturalIntents: NotationIntent[] = [];
    const { container: naturalContainer } = render(
      <Notation score={doc} options={{ accidentals: { insertAlteration: 'natural' } }}>
        <Notation.Interaction targets={['point']} onIntent={(i) => naturalIntents.push(i)} />
      </Notation>,
    );
    const naturalSvg = naturalContainer.querySelector('svg')!;
    stubGeometry(naturalSvg);
    fireEvent.click(naturalSvg, point);
    const naturalTarget = naturalIntents[0]!.target as Extract<HitResult, { kind: 'point' }>;
    expect(naturalTarget.pitch).toEqual({ step: 'F', octave: 5 });
  });

  it('respects interaction.voice for keyboard focus, role and Enter activation', () => {
    const doc = twoVoiceScore();
    const layout = layoutScore(doc);
    const boxes = Object.values(layout.elements);
    const voice0Box = boxes.find((b) => b.voice === 0)!;
    const voice1Box = boxes.find((b) => b.voice === 1)!;
    const intents: NotationIntent[] = [];
    const { container } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['element']} voice={1} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );

    const voice0El = container.querySelector(`g[data-pn="element"][data-pn-el="${voice0Box.id}"]`)!;
    const voice1El = container.querySelector(`g[data-pn="element"][data-pn-el="${voice1Box.id}"]`)!;
    expect(voice0El.getAttribute('role')).toBe('img');
    expect(voice0El.getAttribute('tabindex')).toBeNull();
    expect(voice1El.getAttribute('role')).toBe('button');
    expect(voice1El.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(voice0El, { key: 'Enter' });
    expect(intents).toHaveLength(0);

    fireEvent.keyDown(voice1El, { key: 'Enter' });
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    if (intent.type !== 'activate' || intent.target.kind !== 'element') throw new Error('expected element activate');
    expect(intent.target.id).toBe(voice1Box.id);
  });

  it('re-evaluates hover at the pointer when layout changes while hovering', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const box = Object.values(layout.elements)[0]!;
    const intents: NotationIntent[] = [];
    const { container, rerender } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['element']} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );
    const svg = container.querySelector('svg')!;
    stubGeometry(svg);
    fireEvent.pointerMove(svg, { clientX: box.hitBox.x + box.hitBox.w / 2, clientY: box.hitBox.y + box.hitBox.h / 2 });
    expect(intents).toHaveLength(1);
    expect(intents[0]!.type).toBe('hover');
    expect(intents[0]!.target).not.toBeNull();

    const otherDoc = simpleScore();
    otherDoc.parts[0]!.measures[0]!.sequences[0]!.content.push(noteEvent('A4', QUARTER));
    rerender(
      <Notation score={otherDoc}>
        <Notation.Interaction targets={['element']} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );

    expect(intents).toHaveLength(2);
    expect(intents[1]!.type).toBe('hover');
    expect(intents[1]!.target).not.toBeNull();
  });

  it('emits hover again when the pointer moves vertically inside one slot', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const slot = layout.slots[0]!;
    const system = layout.systems[0]!;
    const intents: NotationIntent[] = [];
    const { container } = render(
      <Notation score={doc}>
        <Notation.Interaction targets={['slot']} onIntent={(i) => intents.push(i)} />
      </Notation>,
    );
    const svg = container.querySelector('svg')!;
    stubGeometry(svg);
    const x = slot.x + slot.w / 2;
    fireEvent.pointerMove(svg, { clientX: x, clientY: system.y + 1 });
    fireEvent.pointerMove(svg, { clientX: x, clientY: system.y + 3 });

    const hovers = intents.filter((i) => i.type === 'hover');
    expect(hovers).toHaveLength(2);
    const pitches = hovers.map((h) => (h.target && h.target.kind === 'slot' ? h.target.pitch : null));
    expect(pitches[0]).not.toEqual(pitches[1]);
  });
});

describe('<Notation.Marks>', () => {
  it('writes states to data-pn-state without re-running layout', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const box = Object.values(layout.elements)[0]!;
    const { container, rerender } = render(
      <Notation score={doc}>
        <Notation.Marks states={{ [box.id]: 'correct' }} />
      </Notation>,
    );
    const el = container.querySelector(`g[data-pn="element"][data-pn-el="${box.id}"]`)!;
    expect(el.getAttribute('data-pn-state')).toBe('correct');

    rerender(
      <Notation score={doc}>
        <Notation.Marks states={{ [box.id]: 'wrong' }} />
      </Notation>,
    );
    const elAfter = container.querySelector(`g[data-pn="element"][data-pn-el="${box.id}"]`)!;
    expect(elAfter).toBe(el);
    expect(elAfter.getAttribute('data-pn-state')).toBe('wrong');
  });

  it('renders a preview ghost from previewShapes and removes it on null', () => {
    const doc = simpleScore();
    const layout = layoutScore(doc);
    const preview = { measureIndex: 0, x: layout.measures[0]!.contentX, pitch: { step: 'D' as const, octave: 4 } };
    const expected = previewShapes(layout, preview);
    const { container, rerender } = render(
      <Notation score={doc}>
        <Notation.Marks preview={preview} />
      </Notation>,
    );
    const group = container.querySelector('[data-pn="preview"]')!;
    expect(group).not.toBeNull();
    if (expected.glyphs.length > 0) {
      expect(group.querySelectorAll('text')).toHaveLength(expected.glyphs.length);
    }

    rerender(
      <Notation score={doc}>
        <Notation.Marks preview={null} />
      </Notation>,
    );
    expect(container.querySelector('[data-pn="preview"]')).toBeNull();
  });
});

it('is stable under StrictMode', () => {
  const doc = simpleScore();
  const ref = createRef<NotationHandle>();
  expect(() =>
    render(
      <StrictMode>
        <Notation score={doc} ref={ref}>
          <Notation.Interaction targets={['element']} onIntent={vi.fn()} />
          <Notation.Marks states={{}} />
        </Notation>
      </StrictMode>,
    ),
  ).not.toThrow();
  expect(ref.current?.getLayout()).toBeDefined();
});

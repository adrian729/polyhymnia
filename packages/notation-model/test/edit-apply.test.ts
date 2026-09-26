import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/edit/apply.js';
import { elementIds } from '../src/mnx/element-ids.js';
import { parsePitch } from '../src/mnx/pitch.js';
import { chord, measure, mnx, note, rest, tuplet } from './support.js';

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schema = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'schema', 'mnx-schema.json'), 'utf8'));
const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(schema);

function expectValid(doc: unknown): void {
  const ok = validate(doc);
  expect(ok, ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
}

const pitches = (...tokens: string[]) => tokens.map(parsePitch);

describe('applyIntent setPitches', () => {
  it('turns a rest into a note, keeping the element id', () => {
    const doc = mnx(measure(rest('q')));
    const before = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0]);
    const result = applyIntent(doc, { type: 'setPitches', event: before!, pitches: pitches('C4') });
    expect(result.changed).toEqual([before]);
    const after = elementIds(result.doc);
    const event = result.doc.parts[0].measures[0].sequences[0].content[0] as any;
    expect(after.idOf(event)).toBe(before);
    expect(event.notes[0].id).toBeUndefined();
    expectValid(result.doc);
  });

  it('turns a note into a chord, minting member ids', () => {
    const doc = mnx(measure(note('C4', 'q')));
    const id = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: pitches('C4', 'E4', 'G4') });
    const event = result.doc.parts[0].measures[0].sequences[0].content[0] as any;
    expect(event.notes.map((n: any) => n.id)).toEqual([`${id}.n0`, `${id}.n1`, `${id}.n2`]);
    expect(result.changed).toContain(`${id}.n1`);
    expectValid(result.doc);
  });

  it('turns a chord into a rest, dropping notes', () => {
    const doc = mnx(measure(chord(['C4', 'E4'], 'q')));
    const id = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: [] });
    const event = result.doc.parts[0].measures[0].sequences[0].content[0] as any;
    expect(event.rest).toEqual({});
    expect(event.notes).toBeUndefined();
    expectValid(result.doc);
  });

  it('keeps an explicit note id across a re-pitch', () => {
    const doc = mnx(measure(note('C4', 'q', {}, { id: 'target-note' })));
    const id = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: pitches('D4') });
    const event = result.doc.parts[0].measures[0].sequences[0].content[0] as any;
    expect(event.notes[0].id).toBe('target-note');
    expect(event.notes[0].pitch).toEqual(parsePitch('D4'));
    expectValid(result.doc);
  });

  it('re-pitches inside a triplet', () => {
    const doc = mnx(measure(tuplet([3, '8'], [2, '8'], note('C4', '8'), note('D4', '8'), note('E4', '8'))));
    const t = doc.parts[0].measures[0].sequences[0].content[0] as any;
    const id = elementIds(doc).idOf(t.content[1])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: pitches('F4') });
    const newT = result.doc.parts[0].measures[0].sequences[0].content[0] as any;
    expect(newT.content[1].notes[0].pitch).toEqual(parsePitch('F4'));
    expect(newT.content[0]).toBe(t.content[0]);
    expect(newT.content[2]).toBe(t.content[2]);
    expectValid(result.doc);
  });

  it('edits only the targeted position when the same event object is shared', () => {
    const shared = note('C4', 'q');
    const doc = mnx(measure(shared, shared));
    Object.freeze(doc);
    Object.freeze(doc.parts[0]);
    Object.freeze(doc.parts[0].measures[0]);
    Object.freeze(doc.parts[0].measures[0].sequences[0]);
    Object.freeze(doc.parts[0].measures[0].sequences[0].content);
    Object.freeze(shared);
    const idsForLookup = elementIds(doc);
    idsForLookup.idOf(shared);
    const secondId = idsForLookup.idOf(shared)!;
    const result = applyIntent(doc, { type: 'setPitches', event: secondId, pitches: pitches('D4') });
    const [first, second] = result.doc.parts[0].measures[0].sequences[0].content as any[];
    expect(first.notes[0].pitch).toEqual(parsePitch('C4'));
    expect(second.notes[0].pitch).toEqual(parsePitch('D4'));
    expect(doc.parts[0].measures[0].sequences[0].content[0]).toBe(shared);
    expect(doc.parts[0].measures[0].sequences[0].content[1]).toBe(shared);
    expectValid(result.doc);
  });

  it('returns the same doc reference and no diagnostic for an unknown id', () => {
    const doc = mnx(measure(note('C4', 'q')));
    const result = applyIntent(doc, { type: 'setPitches', event: 'nope', pitches: pitches('D4') });
    expect(result.doc).toBe(doc);
    expect(result.changed).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'intent-target-missing' }),
    ]);
    expectValid(result.doc);
  });

  it('returns intent-target-unsupported for a whole-bar rest id', () => {
    const doc = mnx({ sequences: [{ content: [], fullMeasure: {} }] } as any);
    const fullId = elementIds(doc).idOf((doc.parts[0].measures[0].sequences[0] as any).fullMeasure)!;
    const result = applyIntent(doc, { type: 'setPitches', event: fullId, pitches: pitches('C4') });
    expect(result.doc).toBe(doc);
    expect(result.changed).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'intent-target-unsupported' }),
    ]);
    expectValid(result.doc);
  });

  it('is a no-op when the pitches are unchanged', () => {
    const doc = mnx(measure(chord(['C4', 'E4'], 'q')));
    const id = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: pitches('C4', 'E4') });
    expect(result.doc).toBe(doc);
    expect(result.changed).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expectValid(result.doc);
  });

  it('drops a tie into a re-pitched note from a previous measure', () => {
    const doc = mnx(
      measure(note('C4', 'q', {}, { id: 'held', ties: [{ target: 'target-note' }] })),
      measure(note('C4', 'q', { id: 'ev1' }, { id: 'target-note' })),
    );
    const result = applyIntent(doc, { type: 'setPitches', event: 'ev1', pitches: pitches('D4') });
    const heldNote = (result.doc.parts[0].measures[0].sequences[0].content[0] as any).notes[0];
    expect(heldNote.ties).toEqual([]);
    expectValid(result.doc);
  });

  it('drops a slur endpoint targeting a removed chord member', () => {
    const doc = mnx(
      measure(
        chord(['C4', 'E4'], 'q', { id: 'ev0' }),
        note('D4', 'q', { slurs: [{ target: 'ev0.n1' }] }),
      ),
    );
    const result = applyIntent(doc, { type: 'setPitches', event: 'ev0', pitches: pitches('C4') });
    const content = result.doc.parts[0].measures[0].sequences[0].content as any[];
    expect(content[1].slurs).toEqual([]);
    expectValid(result.doc);
  });

  it('leaves untouched part-measures and global as ===', () => {
    const doc = mnx(measure(note('C4', 'q')), measure(note('D4', 'q')));
    const id = elementIds(doc).idOf(doc.parts[0].measures[0].sequences[0].content[0])!;
    const result = applyIntent(doc, { type: 'setPitches', event: id, pitches: pitches('E4') });
    expect(result.doc.global).toBe(doc.global);
    expect(result.doc.parts[0].measures[1]).toBe(doc.parts[0].measures[1]);
    expectValid(result.doc);
  });
});

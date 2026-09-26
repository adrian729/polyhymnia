import { elementIds } from '../mnx/element-ids.js';
import type { MnxDocument, Pitch } from '../mnx/types.js';
import { cleanupPartMeasure } from './cleanup.js';
import type { ApplyResult, EditIntent } from './types.js';

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, any> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function isEventNode(node: object): node is Record<string, any> {
  const obj = node as Record<string, any>;
  return ('notes' in obj || 'rest' in obj) && !('pitch' in obj);
}

function pitchKey(pitch: Pitch | undefined): string {
  if (!pitch) return '';
  return `${pitch.step}${pitch.alter ?? 0}/${pitch.octave}`;
}

function missing(event: string): ApplyResult['diagnostics'] {
  return [
    {
      severity: 'warning',
      code: 'intent-target-missing',
      message: `setPitches target ${JSON.stringify(event)} is not an addressable event.`,
    },
  ];
}

function unsupported(event: string): ApplyResult['diagnostics'] {
  return [
    {
      severity: 'warning',
      code: 'intent-target-unsupported',
      message: `setPitches target ${JSON.stringify(event)} is a whole-bar rest, not a real event; give rhythm as real rest events instead.`,
    },
  ];
}

function isFullMeasureRest(found: { full?: boolean } | undefined): boolean {
  return found?.full === true;
}

function substituteAtPath(
  content: readonly unknown[],
  path: readonly number[],
  newEvent: object,
): readonly unknown[] | undefined {
  const [index, ...rest] = path;
  if (index === undefined || index < 0 || index >= content.length) return undefined;
  if (rest.length === 0) {
    const out = content.slice();
    out[index] = newEvent;
    return out;
  }
  const item = asObject(content[index]);
  if (!item || !Array.isArray(item.content)) return undefined;
  const inner = substituteAtPath(item.content, rest, newEvent);
  if (!inner) return undefined;
  const out = content.slice();
  out[index] = { ...item, content: inner };
  return out;
}

function setPitches(doc: MnxDocument, eventId: string, pitches: readonly Pitch[]): ApplyResult {
  const ids = elementIds(doc);
  const found = ids.nodeOf(eventId);
  if (!found || !isEventNode(found.node)) {
    if (isFullMeasureRest(found)) return { doc, changed: [], diagnostics: unsupported(eventId) };
    return { doc, changed: [], diagnostics: missing(eventId) };
  }

  const event = found.node;
  const oldNotes = asArray(event.notes)
    .map((n) => asObject(n))
    .filter((n): n is Record<string, any> => n !== undefined);
  const oldPitchKeys = oldNotes.map((n) => pitchKey(n.pitch));
  const newPitchKeys = pitches.map(pitchKey);
  const sameLength = oldPitchKeys.length === newPitchKeys.length;
  if (sameLength && oldPitchKeys.every((k, i) => k === newPitchKeys[i])) {
    return { doc, changed: [], diagnostics: [] };
  }

  const staleIds = new Set<string>();
  const changed: string[] = [eventId];

  oldNotes.forEach((note, k) => {
    const kept = k < pitches.length && pitchKey(note.pitch) === pitchKey(pitches[k]);
    if (kept) return;
    const oldId =
      typeof note.id === 'string'
        ? note.id
        : ids.idAt({
            measureIndex: found.measureIndex,
            sequenceIndex: found.sequenceIndex,
            path: found.path,
            note: k,
          });
    if (oldId) staleIds.add(oldId);
  });

  const newNotes = pitches.map((pitch, k) => {
    const old = oldNotes[k];
    const samePitch = old !== undefined && pitchKey(old.pitch) === pitchKey(pitch);
    if (pitches.length === 1) {
      if (oldNotes.length === 1 && samePitch) return old;
      const carryId = oldNotes.length === 1 && old && typeof old.id === 'string' ? old.id : undefined;
      return carryId ? { id: carryId, pitch } : { pitch };
    }
    const carryId = old && typeof old.id === 'string' ? old.id : undefined;
    if (carryId) return samePitch ? old : { id: carryId, pitch };
    const id = ids.mint(`${eventId}.n${k}`);
    changed.push(id);
    return { id, pitch };
  });

  const { notes: _oldNotes, rest: _oldRest, ...rest } = event;
  const newEvent: Record<string, any> = { ...rest, id: eventId };
  if (pitches.length === 0) newEvent.rest = {};
  else newEvent.notes = newNotes;

  const part = asObject(doc.parts[0]);
  if (!part || !Array.isArray(part.measures)) return { doc, changed: [], diagnostics: missing(eventId) };
  let substituted = false;
  const newMeasures: unknown[] = [];
  for (let mi = 0; mi < part.measures.length; mi += 1) {
    const pm: unknown = part.measures[mi];
    if (mi !== found.measureIndex) {
      newMeasures.push(cleanupPartMeasure(pm, staleIds));
      continue;
    }
    const measure = asObject(pm);
    if (!measure || !Array.isArray(measure.sequences)) return { doc, changed: [], diagnostics: missing(eventId) };
    const sequences: unknown[] = [];
    for (let si = 0; si < measure.sequences.length; si += 1) {
      const raw: unknown = measure.sequences[si];
      if (si !== found.sequenceIndex) {
        sequences.push(raw);
        continue;
      }
      const sequence = asObject(raw);
      const content = sequence ? substituteAtPath(sequence.content, found.path, newEvent) : undefined;
      if (!sequence || !content) return { doc, changed: [], diagnostics: missing(eventId) };
      substituted = true;
      sequences.push({ ...sequence, content });
    }
    newMeasures.push(cleanupPartMeasure({ ...measure, sequences }, staleIds));
  }
  if (!substituted) return { doc, changed: [], diagnostics: missing(eventId) };

  const newDoc: MnxDocument = { ...doc, parts: doc.parts.map((p, i) => (i === 0 ? { ...part, measures: newMeasures } : p)) } as MnxDocument;
  return { doc: newDoc, changed, diagnostics: [] };
}

export function applyIntent(doc: MnxDocument, intent: EditIntent): ApplyResult {
  if (intent.type === 'setPitches') {
    try {
      return setPitches(doc, intent.event, intent.pitches);
    } catch {
      return { doc, changed: [], diagnostics: missing(intent.event) };
    }
  }
  return { doc, changed: [], diagnostics: [] };
}

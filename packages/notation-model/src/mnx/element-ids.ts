import type { Diagnostic } from './read.js';
import type { MnxDocument } from './types.js';

export type NoteId = string;

export interface ElementIds {
  idOf(node: object): NoteId | undefined;
  nodeOf(id: NoteId): { measureIndex: number; sequenceIndex: number; node: object; path: readonly number[] } | undefined;
  noteIdsOf(eventId: NoteId): ReadonlyMap<object, NoteId> | undefined;
  mint(candidate: string): NoteId;
  readonly diagnostics: readonly Diagnostic[];
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, any> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function collectExplicitIds(source: MnxDocument): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const obj = asObject(value);
    if (!obj) return;
    if (typeof obj.id === 'string') ids.add(obj.id);
    for (const key of Object.keys(obj)) visit(obj[key]);
  };
  visit(source);
  return ids;
}

interface Scope {
  measureIndex: number;
  sequenceIndex: number;
  eventCount: number;
  tupletCount: number;
}

export function elementIds(doc: MnxDocument): ElementIds {
  const diagnostics: Diagnostic[] = [];
  const explicitIds = collectExplicitIds(doc);
  const usedIds = new Set<string>();
  const idOfNode = new WeakMap<object, NoteId[]>();
  const nodeById = new Map<
    NoteId,
    { measureIndex: number; sequenceIndex: number; node: object; path: readonly number[] }
  >();
  const noteIdsByEventId = new Map<NoteId, Map<object, NoteId>>();

  function registerExplicit(id: string, measureIndex: number | undefined): void {
    if (usedIds.has(id)) {
      diagnostics.push({
        severity: 'warning',
        code: 'id-collision',
        message: `Duplicate id ${JSON.stringify(id)} appears on more than one laid-out element; only the first is addressable.`,
        ...(measureIndex === undefined ? {} : { measureIndex }),
      });
      return;
    }
    usedIds.add(id);
  }

  function synth(candidate: string, measureIndex: number | undefined): NoteId {
    if (!explicitIds.has(candidate) && !usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
    let n = 2;
    let id = `${candidate}~${n}`;
    while (explicitIds.has(id) || usedIds.has(id)) {
      n += 1;
      id = `${candidate}~${n}`;
    }
    usedIds.add(id);
    diagnostics.push({
      severity: 'warning',
      code: 'id-collision',
      message: `Synthesized id ${JSON.stringify(candidate)} collides with an existing id; using ${JSON.stringify(id)} instead.`,
      ...(measureIndex === undefined ? {} : { measureIndex }),
    });
    return id;
  }

  function resolve(explicit: unknown, candidate: string, measureIndex?: number): NoteId {
    if (typeof explicit === 'string') {
      registerExplicit(explicit, measureIndex);
      return explicit;
    }
    return synth(candidate, measureIndex);
  }

  function register(
    node: object,
    id: NoteId,
    measureIndex: number,
    sequenceIndex: number,
    path: readonly number[],
  ): void {
    const queued = idOfNode.get(node);
    if (queued) queued.push(id);
    else idOfNode.set(node, [id]);
    if (!nodeById.has(id)) nodeById.set(id, { measureIndex, sequenceIndex, node, path });
  }

  function walkContent(content: readonly unknown[], scope: Scope, path: readonly number[]): void {
    content.forEach((raw, localIndex) => {
      const item = asObject(raw);
      if (!item) return;
      const itemPath = [...path, localIndex];
      switch (item.type) {
        case 'tuplet': {
          const index = scope.tupletCount;
          scope.tupletCount += 1;
          const id = resolve(item.id, `m${scope.measureIndex}.s${scope.sequenceIndex}.t${index}`, scope.measureIndex);
          register(item, id, scope.measureIndex, scope.sequenceIndex, itemPath);
          walkContent(asArray(item.content), scope, itemPath);
          break;
        }
        case 'grace':
          scope.eventCount += asArray(item.content).length;
          break;
        case 'tremolo':
          scope.eventCount += asArray(item.content).length;
          break;
        case 'space':
          break;
        case undefined:
        case 'event': {
          const index = scope.eventCount;
          scope.eventCount += 1;
          const id = resolve(item.id, `m${scope.measureIndex}.s${scope.sequenceIndex}.e${index}`, scope.measureIndex);
          register(item, id, scope.measureIndex, scope.sequenceIndex, itemPath);
          const notes = asArray(item.notes)
            .map((n) => asObject(n))
            .filter((n): n is Record<string, any> => n !== undefined);
          const noteIds = new Map<object, NoteId>();
          notes.forEach((note, k) => {
            const candidate = notes.length === 1 ? id : `${id}.n${k}`;
            const noteId =
              typeof note.id === 'string'
                ? (registerExplicit(note.id, scope.measureIndex), note.id)
                : notes.length > 1
                  ? synth(candidate, scope.measureIndex)
                  : candidate;
            register(note, noteId, scope.measureIndex, scope.sequenceIndex, itemPath);
            noteIds.set(note, noteId);
          });
          noteIdsByEventId.set(id, noteIds);
          break;
        }
        default:
          break;
      }
    });
  }

  const part = asObject(doc.parts?.[0]);
  const globals = asArray(asObject(doc.global)?.measures);
  const partMeasures = asArray(part?.measures);

  globals.forEach((_, measureIndex) => {
    const pm = asObject(partMeasures[measureIndex]);
    const sequences = asArray(pm?.sequences);
    const kept: { sequence: Record<string, any>; index: number }[] = [];
    sequences.forEach((raw, index) => {
      const sequence = asObject(raw);
      if (!sequence) return;
      const staff = typeof sequence.staff === 'number' ? sequence.staff : 1;
      if (staff !== 1) return;
      kept.push({ sequence, index });
    });
    kept.slice(0, 2).forEach(({ sequence, index }) => {
      const scope: Scope = { measureIndex, sequenceIndex: index, eventCount: 0, tupletCount: 0 };
      walkContent(asArray(sequence.content), scope, []);
      const full = asObject(sequence.fullMeasure);
      if (full) {
        const id = resolve(full.id, `m${measureIndex}.s${index}.full`, measureIndex);
        register(full, id, measureIndex, index, []);
      }
    });
  });

  return {
    idOf: (node) => idOfNode.get(node)?.shift(),
    nodeOf: (id) => nodeById.get(id),
    noteIdsOf: (eventId) => noteIdsByEventId.get(eventId),
    mint: (candidate) => synth(candidate, undefined),
    diagnostics,
  };
}

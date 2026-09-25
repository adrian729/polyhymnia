function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasContentArray(value: unknown): value is { content: unknown[] } {
  return isRecord(value) && Array.isArray(value.content);
}

function isEventLike(value: unknown): value is { notes?: unknown; rest?: unknown } {
  return isRecord(value) && (Array.isArray(value.notes) || isRecord(value.rest));
}

function collectIds(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.id === 'string') into.add(value.id);
  for (const key of Object.keys(value)) collectIds(value[key], into);
}

export function mintId(existing: Set<string>, candidate: string): string {
  if (!existing.has(candidate)) {
    existing.add(candidate);
    return candidate;
  }
  let n = 2;
  while (existing.has(`${candidate}-${n}`)) n += 1;
  const id = `${candidate}-${n}`;
  existing.add(id);
  return id;
}

function processEvent(
  event: Record<string, unknown>,
  prefix: string,
  counter: { n: number },
  existing: Set<string>,
): [Record<string, unknown>, boolean] {
  let changed = false;
  let next = event;
  let id = typeof event.id === 'string' ? event.id : undefined;
  if (!id) {
    id = mintId(existing, `${prefix}${counter.n}`);
    next = { ...next, id };
    changed = true;
  }
  counter.n += 1;
  if (Array.isArray(event.notes)) {
    let notesChanged = false;
    const notes = event.notes.map((note: unknown, k: number) => {
      if (!isRecord(note) || typeof note.id === 'string') return note;
      notesChanged = true;
      return { ...note, id: mintId(existing, `${id}-n${k}`) };
    });
    if (notesChanged) {
      next = { ...next, notes };
      changed = true;
    }
  }
  return [next, changed];
}

function processContent(
  content: readonly unknown[],
  prefix: string,
  counter: { n: number },
  existing: Set<string>,
): [unknown[], boolean] {
  let changed = false;
  const out = content.map((item) => {
    if (!isRecord(item)) return item;
    let current: Record<string, unknown> = item;
    if (hasContentArray(current)) {
      const [inner, innerChanged] = processContent(current.content, prefix, counter, existing);
      if (innerChanged) {
        current = { ...current, content: inner };
        changed = true;
      }
    }
    if (isEventLike(current)) {
      const [next, eventChanged] = processEvent(current, prefix, counter, existing);
      if (eventChanged) {
        current = next;
        changed = true;
      }
    }
    return current;
  });
  return [out, changed];
}

export function assignIds<T>(doc: T): T {
  const existing = new Set<string>();
  collectIds(doc, existing);

  if (!isRecord(doc) || !Array.isArray(doc.parts)) return doc;
  const multiPart = doc.parts.length > 1;
  let partsChanged = false;
  const parts = doc.parts.map((part: unknown, partIndex: number) => {
    if (!isRecord(part) || !Array.isArray(part.measures)) return part;
    let measuresChanged = false;
    const measures = part.measures.map((measure: unknown, measureIndex: number) => {
      if (!isRecord(measure) || !Array.isArray(measure.sequences)) return measure;
      const prefix = multiPart ? `p${partIndex}-e${measureIndex}-` : `e${measureIndex}-`;
      const counter = { n: 0 };
      let sequencesChanged = false;
      const sequences = measure.sequences.map((sequence: unknown) => {
        if (!isRecord(sequence) || !Array.isArray(sequence.content)) return sequence;
        const [content, changed] = processContent(sequence.content, prefix, counter, existing);
        if (!changed) return sequence;
        sequencesChanged = true;
        return { ...sequence, content };
      });
      if (!sequencesChanged) return measure;
      measuresChanged = true;
      return { ...measure, sequences };
    });
    if (!measuresChanged) return part;
    partsChanged = true;
    return { ...part, measures };
  });
  if (!partsChanged) return doc;
  return { ...doc, parts };
}

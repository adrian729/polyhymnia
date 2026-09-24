interface WithId {
  id?: unknown;
}

interface MaybeEvent extends WithId {
  notes?: unknown;
  rest?: unknown;
  content?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEventLike(value: unknown): value is MaybeEvent {
  return isRecord(value) && (Array.isArray(value.notes) || isRecord(value.rest));
}

function hasContent(value: unknown): value is { content: unknown[] } {
  return isRecord(value) && Array.isArray(value.content);
}

let existingIds: Set<string>;

function uniqueId(candidate: string): string {
  if (!existingIds.has(candidate)) {
    existingIds.add(candidate);
    return candidate;
  }
  let n = 2;
  while (existingIds.has(`${candidate}-${n}`)) n += 1;
  const id = `${candidate}-${n}`;
  existingIds.add(id);
  return id;
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

function assignEventIds(content: unknown[], eventIdPrefix: string, counter: { n: number }): void {
  for (const item of content) {
    if (hasContent(item)) {
      assignEventIds(item.content, eventIdPrefix, counter);
    }
    if (isEventLike(item)) {
      const event = item;
      const eventId =
        typeof event.id === 'string' ? event.id : uniqueId(`${eventIdPrefix}${counter.n}`);
      if (typeof event.id !== 'string') (event as { id: string }).id = eventId;
      counter.n += 1;
      if (Array.isArray(event.notes)) {
        event.notes.forEach((note: unknown, k: number) => {
          if (isRecord(note) && typeof note.id !== 'string') {
            (note as { id: string }).id = uniqueId(`${eventId}-n${k}`);
          }
        });
      }
    }
  }
}

export function assignIds(doc: unknown): unknown {
  existingIds = new Set();
  collectIds(doc, existingIds);

  if (!isRecord(doc) || !Array.isArray(doc.parts)) return doc;

  const multiPart = doc.parts.length > 1;
  doc.parts.forEach((part: unknown, partIndex: number) => {
    if (!isRecord(part) || !Array.isArray(part.measures)) return;
    part.measures.forEach((measure: unknown, measureIndex: number) => {
      if (!isRecord(measure) || !Array.isArray(measure.sequences)) return;
      const eventIdPrefix = multiPart ? `p${partIndex}-e${measureIndex}-` : `e${measureIndex}-`;
      const counter = { n: 0 };
      measure.sequences.forEach((sequence: unknown) => {
        if (isRecord(sequence) && Array.isArray(sequence.content)) {
          assignEventIds(sequence.content, eventIdPrefix, counter);
        }
      });
    });
  });

  return doc;
}

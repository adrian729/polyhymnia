import type { HorizontalMeasure } from '../layout/horizontal.js';
import type { NoteId } from '../layout/records.js';
import type { Slot } from '../layout/types.js';
import type { VerticalElement } from '../layout/vertical.js';

function elementIdsOf(element: VerticalElement): readonly NoteId[] {
  return element.noteheads.length > 0 ? element.noteheads.map((h) => h.id) : [element.id];
}

export function measureSlots(measure: HorizontalMeasure): readonly Slot[] {
  const slots: Slot[] = [];
  const columns = measure.columns;
  const contentRight = measure.x + measure.width - measure.chrome.endBarlineWidth;
  const contentX = columns[0]?.xStart ?? contentRight;

  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i]!;
    const next = columns[i + 1];
    const bandStart = column.xStart;
    const bandEnd = next ? next.xStart : contentRight;

    for (const element of column.elements) {
      if (element.rest?.wholeBar) {
        slots.push({
          measureIndex: measure.index,
          voice: element.voice,
          tick: element.tick,
          x: contentX,
          w: contentRight - contentX,
          eventId: element.id,
          elementIds: [element.id],
        });
        continue;
      }
      slots.push({
        measureIndex: measure.index,
        voice: element.voice,
        tick: element.tick,
        x: bandStart,
        w: bandEnd - bandStart,
        eventId: element.id,
        elementIds: elementIdsOf(element),
      });
    }
  }

  return slots;
}

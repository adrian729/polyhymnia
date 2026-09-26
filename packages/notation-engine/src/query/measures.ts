import type { HorizontalMeasure } from '../layout/horizontal.js';
import type { MeasureBox } from '../layout/types.js';

export function buildMeasureBox(measure: HorizontalMeasure, systemIndex: number): MeasureBox {
  const contentRight = measure.x + measure.width - measure.chrome.endBarlineWidth;
  const contentX = measure.columns[0]?.xStart ?? contentRight;
  return {
    index: measure.index,
    systemIndex,
    x: measure.x,
    w: measure.width,
    contentX,
    startTick: measure.startTick,
    capacityTicks: measure.capacityTicks,
    clef: measure.clef,
    key: measure.key,
  };
}

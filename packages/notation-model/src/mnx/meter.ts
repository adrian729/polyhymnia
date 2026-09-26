export interface Meter {
  readonly beats: number;
  readonly beatType: number;
}

export interface GroupingOptions {
  mergeBeats?: boolean;
  beatGrouping?: Readonly<Record<string, readonly number[]>>;
}

export interface GroupingResult {
  readonly sizes: readonly number[];
  readonly invalid: boolean;
}

function meterKey(meter: Meter): string {
  return `${meter.beats}/${meter.beatType}`;
}

function totalEighths(meter: Meter): number {
  return meter.beats * (8 / meter.beatType);
}

function oddEighthsGrouping(beats: number): number[] {
  if (beats === 5) return [3, 2];
  if (beats === 7) return [2, 2, 3];
  const sizes: number[] = [];
  let remaining = beats;
  while (remaining > 3) {
    sizes.push(3);
    remaining -= 3;
  }
  sizes.push(remaining);
  return sizes;
}

function defaultGrouping(meter: Meter, mergeBeats: boolean): readonly number[] {
  const { beats, beatType } = meter;
  if (beatType === 8) {
    if (beats % 3 === 0) return Array<number>(beats / 3).fill(3);
    return oddEighthsGrouping(beats);
  }
  if (beatType === 2 || beatType === 1) {
    const unit = beatType === 2 ? 4 : 8;
    return Array<number>(beats).fill(unit);
  }
  if (beatType === 4 && beats === 2) return mergeBeats ? [4] : [2, 2];
  if (beatType === 4 && beats === 3) return mergeBeats ? [6] : [2, 2, 2];
  if (beatType === 4 && beats === 4) return mergeBeats ? [4, 4] : [2, 2, 2, 2];
  const unit = Math.max(1, Math.round(8 / beatType));
  return Array<number>(beats).fill(unit);
}

export function microGrouping(meter: Meter): readonly number[] {
  return defaultGrouping(meter, false);
}

export function beatGroupingFor(meter: Meter, opts?: GroupingOptions): GroupingResult {
  const key = meterKey(meter);
  const custom = opts?.beatGrouping?.[key];
  if (custom) {
    const sum = custom.reduce((a, b) => a + b, 0);
    const valid = sum === totalEighths(meter) && custom.every((n) => Number.isInteger(n) && n > 0);
    if (valid) return { sizes: custom, invalid: false };
    return { sizes: defaultGrouping(meter, opts?.mergeBeats ?? true), invalid: true };
  }
  return { sizes: defaultGrouping(meter, opts?.mergeBeats ?? true), invalid: false };
}

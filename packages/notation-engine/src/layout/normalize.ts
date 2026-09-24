// Pipeline stage 1 — normalize (architecture.md).
//
// Reads the MNX document: resolves clef/key/time per measure by inheriting forward,
// flattens part 0's sequences into per-voice event records, and sanitizes whatever the
// caller handed us. Produces diagnostics, NEVER throws: a hand-written or deserialized
// document must degrade visibly in a live quiz rather than crash it.

import { noteValueLength, readMnx, tupletRatio, Rational as R } from '@polyhymnia/notation-model';
import type {
  Clef,
  Diagnostic,
  Event as MnxEvent,
  MeasureGlobal,
  MnxDocument,
  Note as MnxNote,
  NoteValue,
  PartMeasure,
  Rational,
  Sequence,
  Tie,
} from '@polyhymnia/notation-model';
import type { NotationOptions } from '../options.js';
import {
  DEFAULT_DIVISIONS,
  DEFAULT_TIME,
  type AccidentalPolicy,
  type Alter,
  type ClefSpec,
  type Dots,
  type DurationBase,
  type KeySpec,
  type NoteId,
  type NoteValueSpec,
  type Pitch,
  type StepNumber,
  type TempoEvent,
  type TempoMap,
  type TimeSpec,
  type TupletRef,
} from './records.js';
import { MIDDLE_LINE } from './staff.js';

/** One member of an element's `notes` — a single note, or one member of a chord. */
export interface ElementNote {
  id: NoteId;
  pitch: Pitch;
  tie?: 'start' | 'stop' | 'continue';
  accidentalPolicy?: AccidentalPolicy;
}

export interface NormalizedElement {
  id: NoteId;
  kind: 'note' | 'chord' | 'rest';
  base: DurationBase;
  dots: Dots;
  length: Rational;
  tuplet?: TupletRef;
  notes: readonly ElementNote[];
  stem?: 'up' | 'down';
  breath?: 'comma' | 'caesura';
  wholeBar?: boolean;
  staffPosition?: number;
}

export interface NormalizedGap {
  kind: 'space';
  length: Rational;
}

export type NormalizedEvent = NormalizedElement | NormalizedGap;

export interface NormalizedVoice {
  index: 0 | 1;
  events: readonly NormalizedEvent[];
}

export interface NormalizedMeasure {
  index: number;
  /** Resolved — never undefined, whatever the source measure omitted. */
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  voices: readonly NormalizedVoice[];
  pickup: boolean;
  /** Capacity in whole notes. For a pickup measure this is whatever its content sums
   *  to, not the meter's. */
  capacity: Rational;
  capacityTicks: number;
  barlineStart?: 'none' | 'repeat-start';
  barlineEnd?: 'single' | 'double' | 'dashed' | 'final' | 'repeat-end' | 'none';
  systemBreak: boolean;
}

export interface NormalizedStaff {
  index: number;
  clef: ClefSpec;
  key: KeySpec;
  time: TimeSpec;
  measures: readonly NormalizedMeasure[];
}

export interface NormalizedScore {
  id: string;
  divisions: number;
  tempo: TempoMap;
  staves: readonly NormalizedStaff[];
  diagnostics: readonly Diagnostic[];
  /** Every id already in use — explicit or synthesized — so later stages can keep
   *  disambiguating their own positional ids against it. */
  usedIds: ReadonlySet<string>;
}

const DEFAULT_CLEF: ClefSpec = { kind: 'treble' };
const DEFAULT_KEY: KeySpec = { fifths: 0 };
const STEP_NUMBERS: Record<string, StepNumber> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SUPPORTED_BASES = new Set<string>(['breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th']);
const HANDLED_MARKINGS = new Set(['breath', 'caesura', '_c', '_x', 'id']);

const BARLINES: Partial<Record<string, NormalizedMeasure['barlineEnd']>> = {
  regular: 'single',
  double: 'double',
  dashed: 'dashed',
  final: 'final',
  noBarline: 'none',
};

type MutableNote = { -readonly [K in keyof ElementNote]: ElementNote[K] };

interface PendingTie {
  from: MutableNote;
  tie: Tie;
  measureIndex: number;
}

interface Reader {
  diagnostics: Diagnostic[];
  unsupported(construct: string, measureIndex: number | undefined, consequence: string): void;
  notesById: Map<string, MutableNote>;
  ties: PendingTie[];
  explicitIds: ReadonlySet<string>;
  usedIds: Set<string>;
}

interface SequenceScope {
  measureIndex: number;
  sequenceIndex: number;
  voice: 0 | 1;
  eventCount: number;
  tupletCount: number;
}

export function normalize(doc: MnxDocument, options?: NotationOptions): NormalizedScore {
  const diagnostics: Diagnostic[] = [];
  const divisions = resolveDivisions(options?.divisions, diagnostics);
  const empty = (): NormalizedScore => ({
    id: 'score',
    divisions,
    tempo: [],
    staves: [],
    diagnostics,
    usedIds: new Set(),
  });

  const read = readMnx(doc);
  diagnostics.push(...read.diagnostics);
  const source =
    read.doc ??
    (read.diagnostics.some((d) => d.code === 'mnx-unsupported-version') ? doc : null);
  if (!source) return empty();

  const seen = new Set<string>();
  const reader: Reader = {
    diagnostics,
    notesById: new Map(),
    ties: [],
    explicitIds: collectExplicitIds(source),
    usedIds: new Set(),
    unsupported(construct, measureIndex, consequence) {
      const key = `${construct}@${measureIndex ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const where = measureIndex === undefined ? '' : ` in measure ${measureIndex}`;
      diagnostics.push({
        severity: 'warning',
        code: 'mnx-unsupported',
        message: `Unsupported MNX: ${construct}${where}; ${consequence}.`,
        ...(measureIndex === undefined ? {} : { measureIndex }),
      });
    },
  };

  const parts = asArray(source.parts);
  const part = asObject(parts[0]);
  if (!part) {
    diagnostics.push({
      severity: 'warning',
      code: 'no-parts',
      message: 'Document has no parts; nothing to lay out.',
    });
    return { ...empty(), id: idOf(source) };
  }
  if (parts.length > 1) {
    reader.unsupported(`${parts.length} parts`, undefined, 'only the first part is laid out');
  }
  if (typeof part.staves === 'number' && part.staves > 1) {
    reader.unsupported(`a part with ${part.staves} staves`, undefined, 'only staff 1 is laid out');
  }
  if (part.kit) reader.unsupported('percussion kit', undefined, 'kit notes are not laid out');
  if (part.transposition) {
    reader.unsupported('part transposition', undefined, 'sounding pitches are laid out');
  }

  const globals = asArray(asObject(source.global)?.measures);
  const partMeasures = asArray(part.measures);
  if (globals.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'no-measures',
      message: 'Document has no global measures; nothing to lay out.',
    });
  }
  if (partMeasures.length !== globals.length) {
    diagnostics.push({
      severity: 'warning',
      code: 'measure-count-mismatch',
      message: `Part has ${partMeasures.length} measures but global has ${globals.length}; laying out ${globals.length}.`,
    });
  }

  let currentClef = DEFAULT_CLEF;
  let currentKey = DEFAULT_KEY;
  let currentTime = DEFAULT_TIME;
  let pendingClef: ClefSpec | undefined;
  let firstClef: ClefSpec | undefined;
  let firstKey: KeySpec | undefined;
  let firstTime: TimeSpec | undefined;

  const measures: NormalizedMeasure[] = globals.map((raw, index) => {
    const g = (asObject(raw) ?? {}) as MeasureGlobal;
    const pm = (asObject(partMeasures[index]) ?? {}) as Partial<PartMeasure>;

    if (g.time !== undefined) currentTime = resolveTime(g.time, currentTime, index, diagnostics);
    if (g.key !== undefined) currentKey = resolveKey(g.key, currentKey, index, reader);

    if (pendingClef) currentClef = pendingClef;
    pendingClef = undefined;
    for (const positioned of asArray(pm.clefs)) {
      const entry = asObject(positioned);
      if (!entry) continue;
      const staff = typeof entry.staff === 'number' ? entry.staff : 1;
      if (staff !== 1) {
        reader.unsupported(`clef on staff ${staff}`, index, 'ignored');
        continue;
      }
      const clef = resolveClef(entry.clef, index, reader);
      if (!clef) continue;
      if (isMidMeasure(entry.position)) {
        reader.unsupported('mid-measure clef', index, 'applied from the next measure');
        pendingClef = clef;
      } else {
        currentClef = clef;
      }
    }

    reportGlobalConstructs(g, index, reader);
    reportPartConstructs(pm, index, reader);

    if (partMeasures[index] !== undefined && !Array.isArray(pm.sequences)) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-sequences',
        message: `Measure ${index} has no sequences array; treated as empty.`,
        measureIndex: index,
      });
    }
    const voices = readSequences(asArray(pm.sequences), index, reader);
    const meterCapacity = R.of(currentTime.beats, currentTime.beatType);
    const longest = voices.reduce((max, v) => R.max(max, voiceLength(v.events)), R.ZERO);
    const hasWholeBar = voices.some((v) =>
      v.events.some((e) => e.kind === 'rest' && e.wholeBar === true),
    );
    const pickup =
      index === 0 &&
      !hasWholeBar &&
      R.compare(longest, R.ZERO) > 0 &&
      R.compare(longest, meterCapacity) < 0;
    const capacity = pickup ? longest : meterCapacity;

    firstClef ??= currentClef;
    firstKey ??= currentKey;
    firstTime ??= currentTime;

    return {
      index,
      clef: currentClef,
      key: currentKey,
      time: currentTime,
      voices,
      pickup,
      capacity,
      capacityTicks: R.toTicks(capacity, divisions),
      ...(g.repeatStart ? { barlineStart: 'repeat-start' as const } : {}),
      ...barlineEndOf(g, index, reader),
      systemBreak: false,
    } satisfies NormalizedMeasure;
  });

  resolveTies(reader);
  applySystemBreaks(source, globals, measures, reader);
  const tempo = resolveTempo(globals, measures, divisions, reader);

  return {
    id: idOf(source),
    divisions,
    tempo,
    staves: [
      {
        index: 0,
        clef: firstClef ?? DEFAULT_CLEF,
        key: firstKey ?? DEFAULT_KEY,
        time: firstTime ?? DEFAULT_TIME,
        measures,
      },
    ],
    diagnostics,
    usedIds: reader.usedIds,
  };
}

function idOf(source: MnxDocument): string {
  return typeof source.id === 'string' ? source.id : 'score';
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

function registerExplicitId(id: string, reader: Reader, measureIndex: number | undefined): void {
  if (reader.usedIds.has(id)) {
    reader.diagnostics.push({
      severity: 'warning',
      code: 'id-collision',
      message: `Duplicate id ${JSON.stringify(id)} appears on more than one laid-out element; only the first is addressable.`,
      ...(measureIndex === undefined ? {} : { measureIndex }),
    });
    return;
  }
  reader.usedIds.add(id);
}

function synthId(candidate: string, reader: Reader, measureIndex: number | undefined): string {
  if (!reader.explicitIds.has(candidate) && !reader.usedIds.has(candidate)) {
    reader.usedIds.add(candidate);
    return candidate;
  }
  let n = 2;
  let id = `${candidate}~${n}`;
  while (reader.explicitIds.has(id) || reader.usedIds.has(id)) {
    n += 1;
    id = `${candidate}~${n}`;
  }
  reader.usedIds.add(id);
  reader.diagnostics.push({
    severity: 'warning',
    code: 'id-collision',
    message: `Synthesized id ${JSON.stringify(candidate)} collides with an existing id; using ${JSON.stringify(id)} instead.`,
    ...(measureIndex === undefined ? {} : { measureIndex }),
  });
  return id;
}

function resolveId(
  explicit: unknown,
  candidate: string,
  reader: Reader,
  measureIndex: number | undefined,
): string {
  if (typeof explicit === 'string') {
    registerExplicitId(explicit, reader, measureIndex);
    return explicit;
  }
  return synthId(candidate, reader, measureIndex);
}

function resolveDivisions(value: unknown, diagnostics: Diagnostic[]): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (value !== undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-divisions',
      message: `Invalid divisions ${JSON.stringify(value)}; using ${DEFAULT_DIVISIONS}.`,
    });
  }
  return DEFAULT_DIVISIONS;
}

function resolveClef(value: unknown, measureIndex: number, reader: Reader): ClefSpec | null {
  const clef = asObject(value) as Partial<Clef> | undefined;
  if (!clef) return null;
  const { sign, staffPosition } = clef;
  let kind: ClefSpec['kind'] | undefined;
  if (sign === 'G' && staffPosition === -2) kind = 'treble';
  else if (sign === 'F' && staffPosition === 2) kind = 'bass';
  else if (sign === 'C' && staffPosition === 0) kind = 'alto';
  else if (sign === 'C' && staffPosition === 2) kind = 'tenor';

  if (!kind) {
    if (sign === 'P') {
      reader.unsupported('percussion clef', measureIndex, 'the previous clef is kept');
      return null;
    }
    const fallback = sign === 'F' ? 'bass' : sign === 'C' ? 'alto' : sign === 'G' ? 'treble' : undefined;
    if (!fallback) {
      reader.unsupported(
        `unrecognized clef sign ${JSON.stringify(sign)}`,
        measureIndex,
        'the previous clef is kept',
      );
      return null;
    }
    reader.unsupported(
      `${String(sign)} clef on staff position ${String(staffPosition)}`,
      measureIndex,
      `drawn as a ${fallback} clef`,
    );
    kind = fallback;
  }

  const octave = clef.octave ?? 0;
  if (octave === 1 || octave === -1) return { kind, octaveShift: octave };
  if (octave !== 0) {
    reader.unsupported(`clef octave ${String(octave)}`, measureIndex, 'drawn without an octave shift');
  }
  return { kind };
}

function isMidMeasure(position: unknown): boolean {
  const fraction = asArray(asObject(position)?.fraction);
  return typeof fraction[0] === 'number' && fraction[0] > 0;
}

function resolveKey(
  value: unknown,
  fallback: KeySpec,
  measureIndex: number,
  reader: Reader,
): KeySpec {
  const fifths = asObject(value)?.fifths;
  if (typeof fifths !== 'number' || !Number.isFinite(fifths)) {
    reader.diagnostics.push({
      severity: 'warning',
      code: 'invalid-key-signature',
      message: `Invalid key signature ${JSON.stringify(value)}; inheriting ${fallback.fifths} fifths.`,
      measureIndex,
    });
    return fallback;
  }
  const clamped = Math.max(-7, Math.min(7, Math.round(fifths)));
  if (clamped !== fifths) {
    reader.unsupported(`key signature with ${fifths} fifths`, measureIndex, `drawn with ${clamped} fifths`);
  }
  return { fifths: clamped };
}

function resolveTime(
  value: unknown,
  fallback: TimeSpec,
  measureIndex: number,
  diagnostics: Diagnostic[],
): TimeSpec {
  const time = asObject(value);
  const count = time?.count;
  const unit = time?.unit;
  const valid =
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count > 0 &&
    typeof unit === 'number' &&
    Number.isInteger(unit) &&
    unit > 0;
  if (!valid) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-time-signature',
      message: `Invalid time signature ${JSON.stringify(value)}; inheriting ${fallback.beats}/${fallback.beatType}.`,
      measureIndex,
    });
    return fallback;
  }
  const display = time?.display;
  return display === 'common' || display === 'cut'
    ? { beats: count, beatType: unit, symbol: display }
    : { beats: count, beatType: unit };
}

function barlineEndOf(
  g: MeasureGlobal,
  measureIndex: number,
  reader: Reader,
): { barlineEnd?: NormalizedMeasure['barlineEnd'] } {
  if (g.repeatEnd) {
    const times = asObject(g.repeatEnd)?.times;
    if (typeof times === 'number' && times !== 2) {
      reader.unsupported(`repeat played ${times} times`, measureIndex, 'drawn as a plain end repeat');
    }
    return { barlineEnd: 'repeat-end' };
  }
  const type = asObject(g.barline)?.type;
  if (type === undefined) return {};
  const mapped = typeof type === 'string' ? BARLINES[type] : undefined;
  if (mapped) return { barlineEnd: mapped };
  reader.unsupported(`${String(type)} barline`, measureIndex, 'drawn as a single barline');
  return { barlineEnd: 'single' };
}

function reportGlobalConstructs(g: MeasureGlobal, measureIndex: number, reader: Reader): void {
  if (g.ending) reader.unsupported('ending', measureIndex, 'not drawn');
  if (g.jump) reader.unsupported('jump', measureIndex, 'not drawn');
  if (g.segno) reader.unsupported('segno', measureIndex, 'not drawn');
  if (g.fine) reader.unsupported('fine', measureIndex, 'not drawn');
  if (g.fermata) reader.unsupported('fermata', measureIndex, 'not drawn');
  if (g.number !== undefined) reader.unsupported('measure number override', measureIndex, 'ignored');
}

function reportPartConstructs(pm: Partial<PartMeasure>, measureIndex: number, reader: Reader): void {
  if (asArray(pm.beams).length > 0) reader.unsupported('beams', measureIndex, 'flags are drawn instead');
  if (asArray(pm.dynamics).length > 0) reader.unsupported('dynamics', measureIndex, 'not drawn');
  if (asArray(pm.ottavas).length > 0) reader.unsupported('ottavas', measureIndex, 'not drawn');
  if (asArray(pm.arpeggios).length > 0) reader.unsupported('arpeggios', measureIndex, 'not drawn');
  if (asArray(pm.nonArpeggios).length > 0) reader.unsupported('non-arpeggios', measureIndex, 'not drawn');
  if (asArray(pm.staffConfigs).length > 0) reader.unsupported('staff configs', measureIndex, 'ignored');
  if (pm.measureRepeat) reader.unsupported('measure repeat', measureIndex, 'not drawn');
}

function readSequences(sequences: readonly unknown[], measureIndex: number, reader: Reader): NormalizedVoice[] {
  const kept: { sequence: Partial<Sequence>; index: number }[] = [];
  sequences.forEach((raw, index) => {
    const sequence = asObject(raw) as Partial<Sequence> | undefined;
    if (!sequence) return;
    const staff = typeof sequence.staff === 'number' ? sequence.staff : 1;
    if (staff !== 1) {
      reader.unsupported(`sequence on staff ${staff}`, measureIndex, 'not laid out');
      return;
    }
    kept.push({ sequence, index });
  });

  if (kept.length > 2) {
    reader.diagnostics.push({
      severity: 'warning',
      code: 'too-many-voices',
      message: `Measure ${measureIndex} has ${kept.length} sequences; only 2 are supported, the rest were dropped.`,
      measureIndex,
    });
  }

  return kept.slice(0, 2).map(({ sequence, index }, i) => {
    const voice = (i === 1 ? 1 : 0) as 0 | 1;
    const scope: SequenceScope = { measureIndex, sequenceIndex: index, voice, eventCount: 0, tupletCount: 0 };
    const events: NormalizedEvent[] = [];
    readContent(asArray(sequence.content), scope, undefined, events, reader);
    const full = asObject(sequence.fullMeasure);
    if (full) {
      if (full.fermata) reader.unsupported('fermata', measureIndex, 'not drawn');
      events.push({
        id: resolveId(full.id, `m${measureIndex}.s${index}.full`, reader, measureIndex),
        kind: 'rest',
        base: 'whole',
        dots: 0,
        length: R.ONE,
        notes: [],
        wholeBar: true,
        ...(typeof full.staffPosition === 'number'
          ? { staffPosition: MIDDLE_LINE - full.staffPosition / 2 }
          : {}),
      });
    }
    return { index: voice, events };
  });
}

function readContent(
  content: readonly unknown[],
  scope: SequenceScope,
  tuplet: TupletRef | undefined,
  out: NormalizedEvent[],
  reader: Reader,
): void {
  const { measureIndex } = scope;
  for (const raw of content) {
    const item = asObject(raw);
    if (!item) continue;
    switch (item.type) {
      case 'tuplet': {
        const ref = readTuplet(item, scope, tuplet, reader);
        readContent(asArray(item.content), scope, ref, out, reader);
        break;
      }
      case 'grace':
        scope.eventCount += asArray(item.content).length;
        reader.unsupported('grace notes', measureIndex, 'not drawn');
        break;
      case 'space': {
        const length = fractionOf(item.duration);
        if (length) out.push({ kind: 'space', length });
        break;
      }
      case 'tremolo': {
        scope.eventCount += asArray(item.content).length;
        reader.unsupported('multi-note tremolo', measureIndex, 'its time is left blank');
        const length = quantityLength(item.outer);
        if (length) out.push({ kind: 'space', length: scaled(length, tuplet) });
        break;
      }
      case undefined:
      case 'event': {
        const event = readEvent(item as MnxEvent, scope, tuplet, reader);
        if (event) out.push(event);
        break;
      }
      default:
        reader.unsupported(`sequence content of type ${String(item.type)}`, measureIndex, 'skipped');
    }
  }
}

function readTuplet(
  item: Record<string, any>,
  scope: SequenceScope,
  outer: TupletRef | undefined,
  reader: Reader,
): TupletRef | undefined {
  const index = scope.tupletCount;
  scope.tupletCount += 1;
  const id = resolveId(
    item.id,
    `m${scope.measureIndex}.s${scope.sequenceIndex}.t${index}`,
    reader,
    scope.measureIndex,
  );
  if (typeof item.staff === 'number' && item.staff !== 1) {
    reader.unsupported('cross-staff tuplet', scope.measureIndex, 'laid out on staff 1');
  }
  const ratio = quantityLength(item.inner) && quantityLength(item.outer) ? tupletRatio(item as never) : null;
  if (!ratio) {
    reader.unsupported(
      'tuplet with an unsupported note value',
      scope.measureIndex,
      outer ? "its content keeps only the outer tuplet's ratio" : 'its content is laid out untupled',
    );
    return outer;
  }
  if (!outer) return { id, actual: ratio.actual, normal: ratio.normal };
  reader.unsupported('nested tuplet', scope.measureIndex, 'flattened into one tuplet');
  return { id, actual: ratio.actual * outer.actual, normal: ratio.normal * outer.normal };
}

function readEvent(
  event: MnxEvent,
  scope: SequenceScope,
  tuplet: TupletRef | undefined,
  reader: Reader,
): NormalizedEvent | undefined {
  const { measureIndex, sequenceIndex } = scope;
  const index = scope.eventCount;
  scope.eventCount += 1;
  const id: NoteId = resolveId(
    event.id,
    `m${measureIndex}.s${sequenceIndex}.e${index}`,
    reader,
    measureIndex,
  );

  const value = readNoteValue(event.duration, measureIndex, reader);
  if (!value) return undefined;
  const length = scaled(value.length, tuplet);

  reportEventConstructs(event, measureIndex, reader);

  const notes = asArray(event.notes)
    .map((raw) => asObject(raw) as MnxNote | undefined)
    .filter((n): n is MnxNote => n !== undefined);

  if (notes.length === 0 && !asObject(event.rest)) {
    if (asArray(event.kitNotes).length > 0) {
      reader.unsupported('percussion kit notes', measureIndex, 'their time is left blank');
    } else {
      reader.unsupported('event without notes or rest', measureIndex, 'its time is left blank');
    }
    return { kind: 'space', length };
  }

  const common = {
    id,
    base: value.base,
    dots: value.dots,
    length,
    ...(tuplet ? { tuplet } : {}),
  };

  if (notes.length === 0) {
    const staffPosition = asObject(event.rest)?.staffPosition;
    return {
      ...common,
      kind: 'rest',
      notes: [],
      ...(typeof staffPosition === 'number' ? { staffPosition: MIDDLE_LINE - staffPosition / 2 } : {}),
    };
  }

  const elementNotes = notes.map((note, k) =>
    readNote(note, notes.length === 1 ? id : `${id}.n${k}`, notes.length > 1, measureIndex, reader),
  );
  const stem = event.stemDirection === 'up' || event.stemDirection === 'down' ? event.stemDirection : undefined;
  const breath = breathOf(event, measureIndex, reader);
  return {
    ...common,
    kind: notes.length === 1 ? 'note' : 'chord',
    notes: elementNotes,
    ...(stem ? { stem } : {}),
    ...(breath ? { breath } : {}),
  };
}

function readNoteValue(
  value: NoteValue | undefined,
  measureIndex: number,
  reader: Reader,
): (NoteValueSpec & { length: Rational }) | undefined {
  const nv = asObject(value) as NoteValue | undefined;
  if (!nv || typeof nv.base !== 'string') {
    reader.diagnostics.push({
      severity: 'warning',
      code: 'invalid-duration',
      message: `Measure ${measureIndex} has an event with no readable duration; skipped.`,
      measureIndex,
    });
    return undefined;
  }
  const dots = typeof nv.dots === 'number' && nv.dots > 0 ? Math.floor(nv.dots) : 0;
  const length = SUPPORTED_BASES.has(nv.base) ? noteValueLength({ base: nv.base, dots }) : null;
  if (!length) {
    reader.unsupported(`${nv.base} note value`, measureIndex, 'the event is skipped');
    return undefined;
  }
  if (dots > 2) reader.unsupported(`${dots} dots`, measureIndex, 'two dots are drawn');
  return { base: nv.base as DurationBase, dots: Math.min(dots, 2) as Dots, length };
}

function reportEventConstructs(event: MnxEvent, measureIndex: number, reader: Reader): void {
  if (event.fermata) reader.unsupported('fermata', measureIndex, 'not drawn');
  if (event.lyrics) reader.unsupported('lyrics', measureIndex, 'not drawn');
  if (asArray(event.slurs).length > 0) reader.unsupported('slurs', measureIndex, 'not drawn');
  if (typeof event.staff === 'number' && event.staff !== 1) {
    reader.unsupported('cross-staff event', measureIndex, 'laid out on staff 1');
  }
  const markings = asObject(event.markings);
  if (!markings) return;
  for (const name of Object.keys(markings)) {
    if (HANDLED_MARKINGS.has(name)) continue;
    reader.unsupported(`${name} marking`, measureIndex, 'not drawn');
  }
}

function breathOf(event: MnxEvent, measureIndex: number, reader: Reader): 'comma' | 'caesura' | undefined {
  const markings = asObject(event.markings);
  const breath = asObject(markings?.breath);
  const caesura = asObject(markings?.caesura);
  if (caesura) {
    if ((caesura.shape !== undefined && caesura.shape !== 'normal') || (caesura.marks ?? 1) !== 1) {
      reader.unsupported('caesura variant', measureIndex, 'drawn as a plain caesura');
    }
    if (breath) reader.unsupported('breath mark with a caesura', measureIndex, 'only the caesura is drawn');
    return 'caesura';
  }
  if (!breath) return undefined;
  if (breath.symbol !== undefined && breath.symbol !== 'comma' && breath.symbol !== 'auto') {
    reader.unsupported(`${String(breath.symbol)} breath mark`, measureIndex, 'drawn as a comma');
  }
  return 'comma';
}

function readNote(
  note: MnxNote,
  candidate: NoteId,
  synthesizeCandidate: boolean,
  measureIndex: number,
  reader: Reader,
): ElementNote {
  const noteId =
    typeof note.id === 'string'
      ? (registerExplicitId(note.id, reader, measureIndex), note.id)
      : synthesizeCandidate
        ? synthId(candidate, reader, measureIndex)
        : candidate;
  const element: MutableNote = {
    id: noteId,
    pitch: readPitch(note.pitch, measureIndex, reader),
  };
  const policy = accidentalPolicyOf(note, measureIndex, reader);
  if (policy) element.accidentalPolicy = policy;
  if (typeof note.staff === 'number' && note.staff !== 1) {
    reader.unsupported('cross-staff note', measureIndex, 'laid out on staff 1');
  }
  if (note.written) reader.unsupported('note.written', measureIndex, 'sounding pitch is drawn instead');
  if (note.perform) reader.unsupported('note.perform', measureIndex, 'ignored');
  if (typeof note.id === 'string') reader.notesById.set(note.id, element);
  for (const tie of asArray(note.ties)) {
    const t = asObject(tie) as Tie | undefined;
    if (t) reader.ties.push({ from: element, tie: t, measureIndex });
  }
  return element;
}

function readPitch(value: unknown, measureIndex: number, reader: Reader): Pitch {
  const pitch = asObject(value);
  const step = typeof pitch?.step === 'string' ? STEP_NUMBERS[pitch.step] : undefined;
  const octave = pitch?.octave;
  if (step === undefined || typeof octave !== 'number' || !Number.isInteger(octave)) {
    reader.diagnostics.push({
      severity: 'warning',
      code: 'invalid-pitch',
      message: `Measure ${measureIndex} has a note with an unreadable pitch ${JSON.stringify(value)}; drawn as C4.`,
      measureIndex,
    });
    return { step: 0, alter: 0, octave: 4 };
  }
  const raw = typeof pitch?.alter === 'number' ? pitch.alter : 0;
  const alter = Math.max(-2, Math.min(2, Math.round(raw))) as Alter;
  if (alter !== raw) {
    reader.unsupported(`alter ${raw}`, measureIndex, `drawn with alter ${alter}`);
  }
  return { step, alter, octave };
}

function accidentalPolicyOf(
  note: MnxNote,
  measureIndex: number,
  reader: Reader,
): AccidentalPolicy | undefined {
  const display = asObject(note.accidentalDisplay);
  if (!display) return undefined;
  if (display.show === false) return 'never';
  if (display.show !== true) return undefined;
  const symbol = asObject(display.enclosure)?.symbol;
  if (symbol === undefined) return 'always';
  if (symbol !== 'parentheses') {
    reader.unsupported(`${String(symbol)} accidental enclosure`, measureIndex, 'treated as cautionary');
  }
  return 'cautionary';
}

function resolveTies(reader: Reader): void {
  for (const { from, tie, measureIndex } of reader.ties) {
    if (tie.lv === true) {
      reader.unsupported('laissez-vibrer tie', measureIndex, 'not drawn');
      continue;
    }
    if (tie.targetType !== undefined && tie.targetType !== 'nextNote') {
      reader.unsupported(`tie with targetType ${tie.targetType}`, measureIndex, 'not drawn');
      continue;
    }
    const target = typeof tie.target === 'string' ? reader.notesById.get(tie.target) : undefined;
    if (!target) {
      reader.diagnostics.push({
        severity: 'warning',
        code: 'tie-target-unresolved',
        message: `Measure ${measureIndex}: tie from note ${from.id} targets ${JSON.stringify(tie.target)}, which is not a laid-out note id; ignored.`,
        measureIndex,
      });
      continue;
    }
    from.tie = from.tie === 'stop' || from.tie === 'continue' ? 'continue' : 'start';
    target.tie = target.tie === 'start' || target.tie === 'continue' ? 'continue' : 'stop';
  }
}

function applySystemBreaks(
  source: MnxDocument,
  globals: readonly unknown[],
  measures: NormalizedMeasure[],
  reader: Reader,
): void {
  const { diagnostics } = reader;
  const scores = asArray(source.scores);
  if (scores.length > 1) {
    reader.unsupported(`${scores.length} scores`, undefined, "only the first score's layout is used");
  }
  const score = asObject(scores[0]);
  if (!score) return;
  if (asArray(score.multimeasureRests).length > 0) {
    reader.unsupported('multimeasure rests', undefined, 'each measure is drawn on its own');
  }
  const indexById = new Map<string, number>();
  globals.forEach((g, i) => {
    const id = asObject(g)?.id;
    if (typeof id === 'string') indexById.set(id, i);
  });
  const systems = asArray(score.pages).flatMap((page) => asArray(asObject(page)?.systems));
  for (const raw of systems) {
    const measureId = asObject(raw)?.measure;
    const index = typeof measureId === 'string' ? indexById.get(measureId) : undefined;
    if (index === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'system-measure-unresolved',
        message: `System starts at measure ${JSON.stringify(measureId)}, which is not a global measure id; ignored.`,
      });
      continue;
    }
    const previous = measures[index - 1];
    if (previous) previous.systemBreak = true;
  }
}

function resolveTempo(
  globals: readonly unknown[],
  measures: readonly NormalizedMeasure[],
  divisions: number,
  reader: Reader,
): TempoMap {
  const tempo: TempoEvent[] = [];
  let start = R.ZERO;
  globals.forEach((raw, index) => {
    for (const entry of asArray(asObject(raw)?.tempos)) {
      const t = asObject(entry);
      if (!t || typeof t.bpm !== 'number' || !(t.bpm > 0)) continue;
      const offset = fractionOf(asObject(t.location)?.fraction) ?? R.ZERO;
      const value = asObject(t.value) as NoteValue | undefined;
      const dots = typeof value?.dots === 'number' ? value.dots : 0;
      let beatUnit: NoteValueSpec | undefined;
      if (value && SUPPORTED_BASES.has(value.base) && dots <= 2) {
        beatUnit = { base: value.base as DurationBase, dots: dots as Dots };
      } else {
        reader.unsupported('tempo beat unit', index, 'a quarter-note beat is used');
      }
      tempo.push({
        tick: R.toTicks(R.add(start, offset), divisions),
        bpm: t.bpm,
        ...(beatUnit ? { beatUnit } : {}),
      });
    }
    const measure = measures[index];
    if (measure) start = R.add(start, measure.capacity);
  });
  return tempo;
}

function fractionOf(value: unknown): Rational | undefined {
  const fraction = asArray(value);
  const [n, d] = fraction;
  if (typeof n !== 'number' || typeof d !== 'number' || !Number.isInteger(n) || !Number.isInteger(d)) {
    return undefined;
  }
  if (n < 0 || d <= 0) return undefined;
  return R.of(n, d);
}

function quantityLength(value: unknown): Rational | undefined {
  const quantity = asObject(value);
  const nv = asObject(quantity?.duration) as NoteValue | undefined;
  const multiple = quantity?.multiple;
  if (!nv || typeof multiple !== 'number' || !Number.isInteger(multiple) || multiple <= 0) return undefined;
  const length = noteValueLength(nv);
  return length ? R.multiply(length, R.of(multiple)) : undefined;
}

function scaled(length: Rational, tuplet: TupletRef | undefined): Rational {
  return tuplet ? R.multiply(length, R.of(tuplet.normal, tuplet.actual)) : length;
}

function voiceLength(events: readonly NormalizedEvent[]): Rational {
  return events.reduce(
    (sum, e) => (e.kind === 'rest' && e.wholeBar ? sum : R.add(sum, e.length)),
    R.ZERO,
  );
}

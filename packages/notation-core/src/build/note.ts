// Element builders (interface.md "## Content authoring"). Plain functions constructing
// `ScoreDoc` fragments directly — there is no second implicit data model.

import { createId, asNoteId, asVoiceId } from '../model/ids.js';
import { durationToRational } from '../model/duration.js';
import * as R from '../model/rational.js';
import type {
  AccidentalPolicy,
  ChordEl,
  Duration,
  NoteEl,
  NoteId,
  Pitch,
  RestEl,
  SlurId,
  TupletRef,
  Voice,
  VoiceElement,
} from '../model/types.js';
import type { DurationToken, PitchToken } from '../model/tokens.js';
import { parseDuration } from './duration-tokens.js';
import { parsePitch } from './pitch-tokens.js';

export interface NoteOpts {
  id?: NoteId;
  accidental?: AccidentalPolicy;
  tie?: 'start' | 'stop' | 'continue';
  voice?: 0 | 1;
  // Additive over interface.md's listed set: these are existing `NoteEl` fields with no
  // other way in from the builder API.
  beam?: NoteEl['beam'];
  stem?: NoteEl['stem'];
  slurs?: readonly { id: SlurId; role: 'start' | 'stop' }[];
  meta?: Readonly<Record<string, unknown>>;
}

export interface RestOpts {
  id?: NoteId;
  voice?: 0 | 1;
  /** Render one whole-rest glyph and consume the measure's remaining capacity,
   *  whatever the meter can express (data-model.md). */
  wholeBar?: boolean;
  staffPosition?: number;
}

/** Voice assignment from `opts.voice` on a loose element. Not a `VoiceElement` field —
 *  a voice owns its elements, so this is a builder-only hint `measure()` consumes. */
const VOICE_HINT = Symbol('em.voiceHint');

export function voiceHintOf(el: VoiceElement): 0 | 1 | undefined {
  return (el as { [VOICE_HINT]?: 0 | 1 })[VOICE_HINT];
}

function withVoiceHint<T extends VoiceElement>(el: T, voice: 0 | 1 | undefined): T {
  if (voice === undefined) return el;
  Object.defineProperty(el, VOICE_HINT, { value: voice, enumerable: false });
  return el;
}

export function note(
  pitch: PitchToken | Pitch,
  duration: DurationToken | Duration,
  opts: NoteOpts = {},
): NoteEl {
  const el: NoteEl = {
    kind: 'note',
    id: opts.id ?? asNoteId(createId('n')),
    pitch: parsePitch(pitch),
    duration: parseDuration(duration),
  };
  if (opts.accidental !== undefined) el.accidental = opts.accidental;
  if (opts.tie !== undefined) el.tie = opts.tie;
  if (opts.beam !== undefined) el.beam = opts.beam;
  if (opts.stem !== undefined) el.stem = opts.stem;
  if (opts.slurs !== undefined) el.slurs = opts.slurs;
  if (opts.meta !== undefined) el.meta = opts.meta;
  return withVoiceHint(el, opts.voice);
}

export function rest(duration: DurationToken | Duration, opts: RestOpts = {}): RestEl {
  // `wholeBar` pins the glyph to a whole rest whatever the caller passed: the convention
  // is one whole-rest glyph per empty bar in every meter, never a breve or a dotted
  // shape picked to fit (data-model.md).
  const parsed = parseDuration(duration);
  const el: RestEl = {
    kind: 'rest',
    id: opts.id ?? asNoteId(createId('r')),
    duration: opts.wholeBar ? { base: 'whole', dots: 0 } : parsed,
  };
  if (opts.wholeBar) el.wholeBar = true;
  if (opts.staffPosition !== undefined) el.staffPosition = opts.staffPosition;
  return withVoiceHint(el, opts.voice);
}

/** `wholeBar` rest with no nominal duration to state — sugar for `rest('w', {wholeBar:true})`. */
export function wholeBarRest(opts: Omit<RestOpts, 'wholeBar'> = {}): RestEl {
  return rest('w', { ...opts, wholeBar: true });
}

/**
 * A chord is one rhythmic event, so every member is re-stamped with the chord's
 * duration. Explicit `duration` wins; otherwise it is inferred from the members when
 * they agree. When they disagree and none was given, the shortest member duration wins
 * — the spec doesn't say, and the shortest is the only choice that cannot silently
 * overfill the measure the caller is writing.
 */
export function chord(
  notes: readonly NoteEl[],
  duration?: DurationToken | Duration,
  opts: Pick<NoteOpts, 'id' | 'voice'> = {},
): ChordEl {
  if (notes.length === 0) throw new RangeError('chord() requires at least one note');
  const resolved = duration !== undefined ? parseDuration(duration) : inferChordDuration(notes);
  const el: ChordEl = {
    kind: 'chord',
    id: opts.id ?? asNoteId(createId('c')),
    notes: notes.map((n) => ({ ...n, duration: { ...resolved } })),
    duration: resolved,
  };
  return withVoiceHint(el, opts.voice);
}

function inferChordDuration(notes: readonly NoteEl[]): Duration {
  let shortest = notes[0]!.duration;
  let shortestLength = durationToRational(shortest);
  let agree = true;
  for (const n of notes.slice(1)) {
    const length = durationToRational(n.duration);
    if (!R.equals(length, shortestLength)) agree = false;
    if (R.compare(length, shortestLength) < 0) {
      shortest = n.duration;
      shortestLength = length;
    }
  }
  return agree ? { ...notes[0]!.duration } : { ...shortest };
}

export function voice(index: 0 | 1, ...elements: VoiceElement[]): Voice {
  return { id: asVoiceId(createId('v')), index, elements };
}

/**
 * Scale each element into an `actual`-in-the-time-of-`normal` tuplet, sharing one
 * tuplet id across the group. Returns an array for spreading into `measure()`.
 */
export function tuplet(
  actual: number,
  normal: number,
  ...elements: (VoiceElement | readonly VoiceElement[])[]
): VoiceElement[] {
  if (!Number.isInteger(actual) || actual <= 0) {
    throw new RangeError(`tuplet() actual must be a positive integer, got ${actual}`);
  }
  if (!Number.isInteger(normal) || normal <= 0) {
    throw new RangeError(`tuplet() normal must be a positive integer, got ${normal}`);
  }
  const ref: TupletRef = { id: createId('t'), actual, normal };
  return elements.flat().map((el) => applyTuplet(el, ref));
}

function applyTuplet<T extends VoiceElement>(el: T, ref: TupletRef): T {
  const scaled = { ...el, duration: { ...el.duration, tuplet: ref } } as T;
  if (scaled.kind === 'chord') {
    (scaled as ChordEl as { notes: readonly NoteEl[] }).notes = scaled.notes.map((n) => ({
      ...n,
      duration: { ...n.duration, tuplet: ref },
    }));
  }
  const hint = voiceHintOf(el);
  return withVoiceHint(scaled, hint);
}

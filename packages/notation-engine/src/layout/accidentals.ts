// Pipeline stage 3 — accidentals (architecture.md, engraving.md "## Accidentals").
//
// Which notes get a written accidental. State is `Map<"step:octave", alter>`, reset at
// every barline and seeded from the key signature (key accidentals are octave-agnostic,
// so they are a separate lookup consulted on a miss). Ties carry across the barline: a
// tie-stop never repeats its start's accidental.

import type { NotationOptions } from '../options.js';
import { DEFAULT_OPTIONS } from '../options.js';
import type { Diagnostic } from '@polyhymnia/notation-model';
import type { NoteId, Pitch } from './records.js';
import { accidentalGlyph, keyAlterations } from './staff.js';
import type { NormalizedScore } from './normalize.js';
import type { TemporalElement, TemporalScore } from './temporal.js';

export interface ResolvedAccidental {
  /** The note's own alteration, whether or not a glyph is drawn. */
  alter: -2 | -1 | 0 | 1 | 2;
  /** `null` when no accidental is written for this note. */
  glyph: string | null;
  parenthesized: boolean;
}

export interface AccidentalScore {
  /** One entry per `NoteEl`, chord members included — `glyph: null` means "no glyph". */
  byNote: ReadonlyMap<NoteId, ResolvedAccidental>;
  diagnostics: readonly Diagnostic[];
}

const NONE: ResolvedAccidental = { alter: 0, glyph: null, parenthesized: false };

export function accidentals(
  normalized: NormalizedScore,
  score: TemporalScore,
  options?: NotationOptions,
): AccidentalScore {
  const courtesyPolicy =
    options?.accidentals?.courtesyPolicy ?? DEFAULT_OPTIONS.accidentals.courtesyPolicy;
  const parenthesize =
    options?.accidentals?.parenthesizeCautionary ??
    DEFAULT_OPTIONS.accidentals.parenthesizeCautionary;

  const byNote = new Map<NoteId, ResolvedAccidental>();
  const diagnostics: Diagnostic[] = [];

  for (const staff of normalized.staves) {
    // Ties are the one piece of state that survives a barline (engraving.md).
    const openTies = new Map<string, boolean>();
    // Alterations written in an earlier measure, for the courtesy rule.
    let carriedAlterations = new Map<string, number>();

    for (const measure of staff.measures) {
      const key = keyAlterations(measure.key);
      const state = new Map<string, number>();
      const writtenHere = new Map<string, number>();
      const elements = measureElements(score, staff.index, measure.index);

      for (const el of elements) {
        for (const note of el.notes) {
          const { pitch } = note;
          const slot = `${pitch.step}:${pitch.octave}`;
          const effective = state.get(slot) ?? key.get(pitch.step) ?? 0;
          const policy = note.accidentalPolicy ?? 'auto';

          const tieSlot = tieKey(pitch);
          const tiedIn =
            (note.tie === 'stop' || note.tie === 'continue') && openTies.has(tieSlot);

          let written = false;
          let parenthesized = false;
          if (policy === 'never') {
            written = false;
          } else if (policy === 'always') {
            written = true;
          } else if (policy === 'cautionary') {
            written = true;
            parenthesized = parenthesize;
          } else {
            written = pitch.alter !== effective;
            // Courtesy: this pitch was altered earlier and now reads as the key's own
            // spelling — restate it so the reader isn't left guessing.
            if (!written && courtesyPolicy !== 'none' && carriedAlterations.has(slot)) {
              const carried = carriedAlterations.get(slot)!;
              if (carried !== pitch.alter) {
                written = true;
                parenthesized = parenthesize;
              }
            }
          }

          // A tied-into note never restates its accidental, whatever the measure state
          // would otherwise require — the pitch never stopped sounding.
          if (tiedIn && policy !== 'always' && policy !== 'cautionary') written = false;

          byNote.set(note.id, {
            alter: pitch.alter,
            glyph: written ? accidentalGlyph(pitch.alter) : null,
            parenthesized: written && parenthesized,
          });

          state.set(slot, pitch.alter);
          if (pitch.alter !== (key.get(pitch.step) ?? 0)) writtenHere.set(slot, pitch.alter);
          else writtenHere.delete(slot);
          carriedAlterations.delete(slot);

          if (note.tie === 'start' || note.tie === 'continue') openTies.set(tieSlot, written);
          else openTies.delete(tieSlot);
        }
      }

      // 'next-measure' remembers only the bar just ended; 'always' keeps the memory
      // until the courtesy actually fires.
      if (courtesyPolicy === 'next-measure') {
        carriedAlterations = new Map(writtenHere);
      } else if (courtesyPolicy === 'always') {
        for (const [slot, alter] of writtenHere) carriedAlterations.set(slot, alter);
      }
    }
  }

  return { byNote, diagnostics };
}

/** Resolution for a note the stage never saw (defensive — emit must not crash). */
export function accidentalOf(
  resolved: AccidentalScore,
  id: NoteId,
): ResolvedAccidental {
  return resolved.byNote.get(id) ?? NONE;
}

function tieKey(p: Pitch): string {
  return `${p.step}:${p.alter}:${p.octave}`;
}

function measureElements(
  score: TemporalScore,
  staffIndex: number,
  measureIndex: number,
): readonly TemporalElement[] {
  return score.elements
    .filter((e) => e.staffIndex === staffIndex && e.measureIndex === measureIndex)
    .sort((a, b) => a.tick - b.tick || a.voice - b.voice);
}


# Playback position

The component never touches `AudioContext`, never schedules, never owns a clock. It accepts a position and paints.

## Timemap: the shared source of truth

The temporal pass already computes exact onset ticks for every element (`architecture.md` pipeline stage 2) — needed anyway for beat grouping, tuplet scaling, and measure validation. Exposing it costs nothing. The alternative — an audio engine independently walking `ScoreDoc` to compute its own onsets — means two implementations of dotted-note arithmetic, tuplet scaling, tie merging, and pickup-measure handling, which will disagree exactly on the material worth drilling most.

```ts
interface TimeMapEntry {
  // one row per chord/note/rest; `ids` holds every member NoteId — length 1 for a note/rest,
  // length N for a chord. Mirrors ElementBox's per-member addressing (architecture.md) so
  // `activeAt`/`byId` resolve to the same ids the rendered <g>s are keyed by.
  ids: readonly NoteId[]; tick: number; durationTicks: number;    // tie-merged: a tied pair is ONE entry
  measureIndex: number; voice: 0|1;
  systemIndex: number; x: number; y: number;           // sp coords — cursor placement, scroll-into-view
  midi?: number; midiNotes?: readonly number[];         // undefined for rests
  kind: 'note' | 'chord' | 'rest';
}
interface MeasureTime { index: number; startTick: number; endTick: number; systemIndex: number; x: number; w: number }
interface TimeMap {
  divisions: number; entries: readonly TimeMapEntry[]; measures: readonly MeasureTime[]; tempo: TempoMap;
  tickToSeconds(tick: number): number;
  secondsToTick(seconds: number): number;
  positionAtTick(tick: number): { systemIndex: number; x: number; yTop: number; yBottom: number } | null;
  activeAt(tick: number): readonly NoteId[];    // flattens every active entry's `ids`
  byId(id: NoteId): TimeMapEntry | undefined;   // searches each entry's `ids`
}
```

Reachable via `onLayout(layout)` (declarative) or `handle.getTimeMap()` (imperative pull).

## How the audio engine uses it

Scheduling — notation time → audio time, no musical arithmetic in the audio engine:

```ts
const tm = layout.timemap; const t0 = ctx.currentTime + LEAD_IN;
for (const e of tm.entries) {
  if (e.kind === 'rest') continue;
  const start = t0 + tm.tickToSeconds(e.tick), end = t0 + tm.tickToSeconds(e.tick + e.durationTicks);
  for (const midi of e.midiNotes ?? [e.midi!]) sampler.start({ note: midi, time: start, duration: end - start });
}
```

Reporting — audio time → notation time, driven by the *audible* clock:

```ts
function frame() {
  const tick = tm.secondsToTick(ctx.currentTime - t0);
  handle.setPlaybackTick(tick);
  raf = requestAnimationFrame(frame);
}
```

**Latency contract:** the position fed to the component MUST derive from `audioContext.currentTime`, never the scheduler's lookahead pointer. Web Audio lookahead queues 100–200ms ahead; driving the cursor from "what was last queued" makes it visibly run ahead of the sound. `tickToSeconds(0)` = when the first note actually sounds; lead-in is the caller's problem, not the component's.

## Tempo

Lives in `ScoreDoc`, not the audio engine — a metronome mark is notation data.

```ts
interface TempoEvent { tick: number; bpm: number; beatUnit?: DurationBase }   // default 'quarter'
type TempoMap = readonly TempoEvent[];    // piecewise-constant; ramps deferred
```

`tickToSeconds` = a prefix-sum lookup over the tempo map, O(log n).

## Modes

```ts
type PlaybackView =
  | { mode: 'off' }
  | { mode: 'notes'; activeIds: readonly NoteId[] }
  | { mode: 'cursor'; position: {tick:number}|{seconds:number}; follow?: 'none'|'scroll'; highlightActive?: boolean }
  | { mode: 'manual' };   // driven entirely via the imperative handle
```

`notes` is the common case — a `Set` membership check while emitting, `data-em-playing="true"` on matches. Costs nothing (a chord-ID quiz playing four notes is the whole feature). `cursor` is continuous playback; `highlightActive: true` derives `activeIds` from `timemap.activeAt(tick)` so the caller never maintains both.

`positionAtTick` interpolates piecewise-linearly between column x positions, timed so the cursor reaches column *i* exactly when it sounds — NOT time-proportional, since spacing follows the power law in `engraving.md` and proportional motion would drift off the noteheads for mixed durations.

## 60fps cursor without re-rendering the score

A `setState`-driven cursor at 60fps re-renders the whole score 60×/sec — unacceptable, and it would undo the whole point of a declarative renderer. Three mechanisms, in order of preference:

1. **WAAPI** (preferred) — the audio engine knows a scheduled span's wall-clock start/duration, so the cursor gets **zero per-frame JS**:
   ```ts
   interface CursorSpan { fromTick: number; toTick: number; startTimeMs: number; durationMs: number }
   handle.animateCursor({ fromTick, toTick, startTimeMs, durationMs } satisfies CursorSpan);
   // internally: cursorGroup.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' })
   // keyframes built from timemap column x's, offset = normalized time — reproduces the
   // piecewise-linear motion above in one Animation object
   ```
   Survives tab throttling, pauseable/seekable via `Animation.currentTime`. Relies on `transform: translateX()` on an SVG `<g>` (SVG2/CSS-transforms) — well-supported in current Chrome/Firefox/Safari but smoke-test Safari before committing (`roadmap.md`).
2. **rAF + a single attribute write** via ref — for seeking/scrubbing, or an engine that doesn't know spans in advance. No React render.
3. **The declarative `position` prop** — tests, SSR, low-frequency updates. Always correct, never the hot path.

None of these create/remove/reparent DOM nodes: the cursor `<g>` is created and keyed by React; imperative code only writes a transform on it. No StrictMode double-effect hazard, because there's nothing created to duplicate. The `architecture.md` rule still holds — nothing creates/removes/reparents nodes outside the reconciler; writing a transform attribute on a React-owned node isn't an exception to it.

## Presentation

CSS only. The component emits `<g data-em-cursor><rect/></g>` spanning the staff height — it doesn't decide line vs. band vs. glow vs. off. `mode:'notes'` only sets `data-em-playing` — styling is entirely the app's call (`architecture.md` theming contract).

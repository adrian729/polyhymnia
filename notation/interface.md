# Public API

React components a consumer imports and writes. Internals: `architecture.md`, `engraving.md`, `interaction.md`, `playback.md`.

## Root component

```ts
interface NotationProps {
  score: MnxDocument;                 // mnx.md, required — plain MNX, no private fields (AGENTS.md)
  options?: NotationOptions;          // below, all fields default
  children?: React.ReactNode;         // compound children, below
  className?: string; style?: React.CSSProperties;
  onLayout?: (layout: LayoutResult) => void;   // architecture.md — declarative alternative to handle.getLayout()
}
```

```tsx
<Notation
  score={doc}
  options={notationOptions}
  className style
  ref={handleRef}          // NotationHandle
/>
```

Renders the `<svg>`, computes layout (`useMemo`, keyed on `score` identity), provides layout to compound children below. No `children` = static, non-interactive, read-only render.

## Compound children — interaction, playback

```tsx
<Notation score={doc} options={opts} ref={handleRef}>
  <Notation.Interaction targets={['slot', 'element']} onIntent={handleIntent} />
  <Notation.Marks states={states} selection={selection} preview={preview} />
  <Notation.Playback view={{ mode: 'notes', activeIds }} />
</Notation>
```

- `Notation.Interaction` props = `NotationInteractionProps` and `Notation.Marks` props = `NotationMarksProps` (both `interaction.md`). `Notation.Playback` props = `{ view: PlaybackView }` (`playback.md`) — implemented for `mode:'notes'`/`'off'`; `mode:'cursor'` is a no-op (deferred), `mode:'manual'` is left untouched (driven only via `handle.setPlaybackTick`).
- Render nothing themselves. `<Notation>` extracts their props via direct-child introspection (`React.Children`) — single render pass, no context round-trip. Must be direct children, same constraint as `<select><option>`.
- One of each meaningful; duplicate = last wins.
- Compound over flat props: pay only for what's used (no interaction code in the tree for a read-only reveal); a new behavior is a new child, not a bigger prop object.

## Imperative handle

```ts
interface NotationHandle {
  getLayout(): LayoutResult;
  getTimeMap(): TimeMap;
  hitTest(p: { x: number; y: number }, opts?: HitOptions): HitResult | null;
  setPlaybackTick(tick: number): void;
  animateCursor(span: unknown): never;            // deferred — mode:'cursor' is not built
  exportSVG(): string;
  focus(id: NoteId): void;                        // NoteId — a plain string, mnx.md's ID rule
}
```

Implemented in `notation-react`: `getLayout`, `getTimeMap`, `exportSVG`, `setPlaybackTick` (drives `mode:'notes'` highlighting from `timemap.activeAt(tick)`, imperatively, no re-render), `hitTest` (delegates to the engine's `hitTest` over the current layout), `focus` (focuses the element `<g>` by id via the same ref map `setPlaybackTick` uses; no-op if the id has no on-screen element). `animateCursor` still throws — `mode:'cursor'` is deferred (`roadmap.md`).

## Options

One nested typed object, not flat props. Same type on the React prop and `layoutScore(doc, options)` (`architecture.md`) — one options surface, not two.

```ts
interface NotationOptions {
  divisions?: number;                                                                // mnx.md, default 3360 — engine option, not document data
  spacing?: { k?: number; base?: number };                                          // engraving.md, default k=0.55 base=3.2sp
  beaming?: { mergeBeats?: boolean; beatGrouping?: Record<string, readonly number[]> }; // engraving.md; the engine reads this for its own auto-beaming (a measure with no explicit MNX `beams`)
  accidentals?: {
    courtesyPolicy?: 'none' | 'next-measure' | 'always';                            // default 'next-measure'
    parenthesizeCautionary?: boolean;
    insertAlteration?: 'key' | 'natural';                                            // interaction.md, default 'key'
  };
  tuplets?: { showRatio?: boolean };         // engraving.md, default false — numeral shows actual only
  widthSp?: number;                          // system width, engraving.md
  maxLastSystemFill?: number;                // default 0.65, engraving.md
}
```

Every field defaults; `<Notation score={doc}>` alone is valid.

## Authoring scores

`score: MnxDocument` is the only source of truth — no private extensions, no JSX-per-note composition (`<Note pitch="C4"/>` as a real content element). A note can't render standalone: layout needs the whole score for spacing/beaming, so a per-note component would just be a non-rendering data-collection shim — a second implicit data model reconciling into MNX anyway, for no benefit. There is no builder API; MNX content comes from one of three places:

1. **Hand-written `.mnx.json`** — the natural form for fixed exercise content. `apps/web/src/scores/*.mnx.json` is both the demo gallery's content and the reference for what hand-authored MNX looks like; every file there is validated against the pinned schema by the same Ajv test `mnx.md` describes for fixture files.
2. **Generated in code** — presets (below) and any future content generator construct plain MNX object literals directly; `notation-model`'s `parsePitch`/`Rational`/`noteValueLength` (`mnx.md`) are the only helpers, there's no `score()`/`measure()`/`note()` builder layer to call instead.
3. **MusicXML import, offline** — `tools/musicxml-to-mnx convert <in.musicxml> <out.mnx.json>` converts MusicXML exported from notation apps (MuseScore/Dorico/Sibelius) into committed `.mnx.json` files, the same way hand-written scores are committed: convert (`mnxconverter`, pinned) → Ajv against the pinned schema + headless `layoutScore` (`tools/musicxml-to-mnx/src/check.ts`) → deterministic ids assigned to events/notes that lack them (`src/ids.ts`) → write. See `tools/musicxml-to-mnx/SPIKE.md` for coverage of the supported subset. Not a runtime import path — no product flow needs a user uploading a file at this point, so none is built (`AGENTS.md`).

Editing existing content (not authoring it fresh) goes through `applyIntent` (`interaction.md`), which is also a pure MNX→MNX function and preserves whatever content it doesn't touch.

## Presets

`@polyhymnia/notation-react/presets` — separate export path, tree-shaken out if unused. Thin wrappers around `<Notation>` for the single-exercise case — not a scoped feature of their own (`README.md`), just sugar that builds a small MNX document internally from a few typed props; nothing outside `presets/` constructs MNX by hand for the app.

```ts
interface ChordRevealProps { pitches: readonly PitchToken[]; clef: ClefKind; duration?: NoteValue }   // default { base: 'quarter' }
interface IntervalRevealProps { from: PitchToken; to: PitchToken; clef: ClefKind; mode: 'harmonic' | 'melodic'; duration?: NoteValue }   // default { base: 'quarter' }
type ScaleName = 'major' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor';
interface ScaleRevealProps { root: PitchToken; scale: ScaleName; clef: ClefKind; descending?: boolean; duration?: NoteValue }   // default { base: 'quarter' }
```

- `PitchToken` — the same `'C4'` / `'F#5'` / `'Bb3'` string grammar `parsePitch` (`mnx.md`) accepts; presets parse it internally to an MNX `pitch` object.
- `ClefKind` — `'treble' | 'bass' | 'alto' | 'tenor'`, the engine's resolved clef kinds (`engraving.md`); presets translate this to the MNX `{sign, staffPosition}` pair `mnx.md`'s clef mapping table expects.
- `duration` — an MNX note value, `{ base: NoteValueBase; dots?: number }` (`mnx.md`), not a token string — same shape a hand-written `.mnx.json` event's `duration` would use.

`descending: true` with `scale: 'melodicMinor'`: uses the classical descending form (natural-minor pitches, lowered 6th/7th) — a genuinely different pitch set from the ascending form, not the same notes reversed. Every other `scale` value: `descending` reverses the same (ascending) pitch set, since only melodic minor has direction-dependent content.

```tsx
<ChordReveal pitches={['C4','E4','G4']} clef="treble" />
<IntervalReveal from="C4" to="E4" clef="treble" mode="harmonic" />
<ScaleReveal root="D4" scale="major" clef="treble" />
```

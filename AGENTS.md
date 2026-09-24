# Modules
- Each package (`notation-model`, `notation-engine`, `notation-react`, `notation-font`, `tools/musicxml-to-mnx`) is an isolated module, publishable as its own npm package later without moving code.
- Dependency direction only: model ← engine ← react; tools may use model + engine. Never import upward or sideways.
- Cross-package imports go through the package name and entry points declared in its `package.json` `exports`, never relative paths or deep `src/` paths. Every cross-package import must be declared in that package's `package.json`.
- `notation-model` and `notation-engine`: no DOM, no React, no Node APIs (`lib` excludes DOM). Renderer-specific code lives only in a renderer package (`notation-react`, future others).
- New concern that doesn't fit an existing package's role → new package, not a folder inside another.
- `apps/*` consume packages only through their public exports; no app code inside packages.

# Interaction (answer entry)
- Planned right after beaming: hit-testing, insertion slots, `applyIntent` (`notation/interaction.md`). Design every feature so this stays cheap to add; never take a shortcut interaction would have to undo.
- Every drawn element keeps its MNX/positional id and a hitbox in `LayoutResult`; ids stay stable when an edited document is re-laid out.
- Derived notation (beams, tuplet brackets, accidentals, padding rests) is recomputed from MNX on each layout or produced by a pure MNX → MNX function; no state that exists only after rendering.

# Score format
- MNX (w3c-cg/mnx) is the only score format. Public APIs take and return plain MNX. Never add private fields or `_x` extensions to documents.
- No custom score model, builder API, or internal "MNX + additions" representation. Layout structures derived from MNX stay inside `notation-engine`.
- Only `layout/normalize.ts` in `notation-engine` reads MNX documents; later stages consume its flat records.
- Unsupported MNX → render what's possible + `mnx-unsupported` diagnostic; never throw.
- Elements apps reference (playback highlight, quiz lookups, clicks) must carry MNX `id`s; the engine synthesizes positional ids otherwise.
- App/quiz data about notes lives in the app, keyed by note id, never in the MNX document.

# MNX schema
- Pinned in `packages/notation-model/schema/` (`SOURCE` = commit, date, version). Upgrade only via `pnpm mnx:update <commit>`, deliberately. Never hand-edit the schema, examples, or generated `src/mnx/types.ts`.

# notation-model
- Thin layer only: vendored schema + examples, generated types, `readMnx` version check, pitch/rational/duration math, `parsePitch`. Add code only for a current consumer; no speculative helpers.
- `beam()` and edit operations (`applyIntent`) = pure MNX → MNX functions that preserve untouched content.

# MusicXML
- Import-only, offline: `tools/musicxml-to-mnx` → committed `.mnx.json`. No runtime import or export until a product flow needs it.
- Conversion uses npm `mnxconverter`, pinned, behind one `convert()` wrapper. Output must pass Ajv against the pinned schema and headless `layoutScore` with no errors and no `mnx-unsupported` outside `UNSUPPORTED_ALLOWLIST` (`tools/musicxml-to-mnx/src/check.ts`, currently `beams` only). Grow the allowlist only for constructs the engine will support but doesn't draw yet.
- Keep `patches/mnxconverter@1.2.0.patch` (fixes broken published entry points) until the package verifiably works unpatched.

# Dependencies
- Simple work → write it ourselves even if a library exists. Complex work → dependency, pinned, wrapped for replacement, maintained and tracking the MNX schema.
- Ajv and `json-schema-to-typescript` are devDependencies only; never in runtime bundles.
- Rejected, don't reintroduce without re-evaluation: Python `w3c-cg/mnxconverter` (stale), `@mnxjs/*` (source gone), `@quonset/minim`, `musicxml-interfaces` (AGPL), `@stringsync/musicxml` (stale).

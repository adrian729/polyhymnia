// `@polyhymnia/notation-model` — pure TypeScript, no DOM, no React.
//
// MNX (w3c-cg/mnx) is the only score format (AGENTS.md "Score format"); this package
// is a thin layer over it, so the package root re-exports the MNX layer whole.

export * from './mnx/index.js';
export * from './edit/index.js';

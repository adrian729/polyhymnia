# Polyhymnia

Dev commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm dev`.

Run `pnpm build` first on a fresh clone: cross-package imports resolve through gitignored `dist/`, so `pnpm typecheck` fails without it.

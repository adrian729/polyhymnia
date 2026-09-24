#!/usr/bin/env node
// Build-time only (architecture.md) — never in the runtime dep tree, never in
// `npm install`. Requires: python3 -m venv .venv && .venv/bin/pip install
// fonttools brotli (once), and vendor/Bravura.{otf,json} (steinbergmedia/bravura
// release bravura-1.482, matched by Bravura.json's exact byte size, 1,256,995B).
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { GLYPHS, UNICODE_RANGES, RENAMED_FAMILY, SOURCE_FONT } from './manifest.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(here, 'vendor');
const dist = path.join(here, 'dist');
const venvPython = path.join(here, '.venv', 'bin', 'python3');

if (!existsSync(venvPython)) {
  throw new Error('Missing .venv — run: python3 -m venv .venv && .venv/bin/pip install fonttools brotli');
}
mkdirSync(dist, { recursive: true });

const sourceOtf = path.join(vendor, SOURCE_FONT);
const sourceJson = path.join(vendor, 'Bravura.json');
const preRename = path.join(dist, '_prerename.otf');
const finalOtf = path.join(dist, '_renamed.otf');
const finalWoff2 = path.join(dist, 'earmaster-notation.woff2');
const finalMetadata = path.join(dist, 'metadata.json');

// 1. Subset — same manifest.UNICODE_RANGES drives this and the metadata filter below.
execFileSync(venvPython, [
  '-m', 'fontTools.subset', sourceOtf,
  `--unicodes=${UNICODE_RANGES}`,
  `--output-file=${preRename}`,
  '--no-hinting', '--desubroutinize',
  '--drop-tables+=GSUB,GPOS,BASE,JSTF,DSIG', "--name-IDs=", '--notdef-outline',
]);

// 2. Rename CFF fontName + name IDs 1/4/6/16 (OFL rename obligation, font.md) + WOFF2-compress.
execFileSync(venvPython, [
  path.join(here, 'rename_and_compress.py'),
  preRename, finalOtf, finalWoff2, RENAMED_FAMILY,
]);
rmSync(preRename);
rmSync(finalOtf);

// 3. Filter metadata JSON to the same glyph set (engravingDefaults kept in full — it's global).
execFileSync(venvPython, [
  path.join(here, 'filter_metadata.py'),
  sourceJson, finalMetadata, RENAMED_FAMILY,
  ...Object.keys(GLYPHS),
]);

// 4. License + notice, shipped alongside per font.md's license obligation.
copyFileSync(path.join(vendor, 'OFL.txt'), path.join(dist, 'OFL.txt'));
copyFileSync(path.join(here, 'NOTICE.txt'), path.join(dist, 'NOTICE.txt'));

console.log(`Built ${finalWoff2} + ${finalMetadata} (${Object.keys(GLYPHS).length} glyphs).`);

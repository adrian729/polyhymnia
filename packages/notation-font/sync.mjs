#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const packages = path.dirname(here);

const targets = [
  ['metadata.json', path.join(packages, 'notation-engine', 'src', 'font')],
  ['polyhymnia-notation.woff2', path.join(packages, 'notation-engine', 'assets')],
  ['OFL.txt', path.join(packages, 'notation-engine', 'assets')],
  ['NOTICE.txt', path.join(packages, 'notation-engine', 'assets')],
  ['polyhymnia-notation.woff2', path.join(packages, 'notation-react', 'styles')],
];

for (const [file, dir] of targets) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(dist, file), path.join(dir, file));
  console.log(`Synced ${file} -> ${path.relative(packages, dir)}/`);
}

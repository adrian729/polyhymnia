#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { convert } from './convert.js';
import { check } from './check.js';
import { assignIds } from './ids.js';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main(argv: string[]): void {
  const [inputPath, outputPath] = argv;
  if (!inputPath || !outputPath) {
    fail('Usage: musicxml-to-mnx convert <in.musicxml|.xml> <out.mnx.json>');
  }

  const ext = extname(inputPath).toLowerCase();
  if (ext === '.mxl') {
    fail(`${inputPath}: compressed MusicXML (.mxl) is not supported — decompress to .musicxml/.xml first.`);
  }
  if (ext !== '.musicxml' && ext !== '.xml') {
    fail(`${inputPath}: expected a .musicxml or .xml file, got "${ext}".`);
  }

  const musicXml = readFileSync(inputPath, 'utf8');

  let converted: unknown;
  try {
    converted = convert(musicXml);
  } catch (error) {
    fail(`${inputPath}: conversion failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = check(converted);
  if (!result.ok) {
    process.stderr.write(`${inputPath}: ${result.problems.length} problem(s):\n`);
    for (const problem of result.problems) process.stderr.write(`  [${problem.kind}] ${problem.message}\n`);
    process.exit(1);
  }

  const withIds = assignIds(converted);
  writeFileSync(outputPath, `${JSON.stringify(withIds, null, 2)}\n`, 'utf8');
  process.stdout.write(`${inputPath} -> ${outputPath}\n`);
}

main(process.argv.slice(2));

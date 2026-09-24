#!/usr/bin/env node
import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCHEMA_PATH = path.join(PACKAGE_ROOT, 'schema', 'mnx-schema.json');
const OUTPUT_PATH = path.join(PACKAGE_ROOT, 'src', 'mnx', 'types.ts');

async function main() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  let ts = await compile(schema, 'MnxDocument', {
    style: { singleQuote: true },
    additionalProperties: false,
  });
  ts = ts.replace(/\bMNXDocument\b/g, 'MnxDocument');
  await writeFile(OUTPUT_PATH, ts);
  console.log(`Wrote ${path.relative(PACKAGE_ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

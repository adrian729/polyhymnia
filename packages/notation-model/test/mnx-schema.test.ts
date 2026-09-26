import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCHEMA_DIR = path.join(PACKAGE_ROOT, 'schema');
const EXAMPLES_DIR = path.join(SCHEMA_DIR, 'examples');

const schema = JSON.parse(readFileSync(path.join(SCHEMA_DIR, 'mnx-schema.json'), 'utf8'));
const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(schema);

const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json'));

const KNOWN_INVALID: readonly string[] = [];

describe('vendored MNX examples validate against the vendored schema', () => {
  it(`found the expected number of example documents`, () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  const toCheck = exampleFiles.filter((f) => !KNOWN_INVALID.includes(f));
  it.each(toCheck)('%s', (file) => {
    const doc = JSON.parse(readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'));
    const valid = validate(doc);
    expect(valid, ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
  });

});

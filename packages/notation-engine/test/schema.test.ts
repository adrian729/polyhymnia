import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const SCHEMA = fileURLToPath(new URL('../../notation-model/schema/mnx-schema.json', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const WEB_SCORES = fileURLToPath(new URL('../../../apps/web/src/scores/', import.meta.url));

const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
const fixtures = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
const webScores = readdirSync(WEB_SCORES).filter((f) => f.endsWith('.mnx.json'));

describe('engine test fixtures validate against the pinned MNX schema', () => {
  it('found fixtures to check', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('%s', (file) => {
    const doc = JSON.parse(readFileSync(`${FIXTURES}${file}`, 'utf8'));
    expect(validate(doc), ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
  });
});

describe('apps/web demo scores validate against the pinned MNX schema', () => {
  it('found web scores to check', () => {
    expect(webScores.length).toBeGreaterThan(0);
  });

  it.each(webScores)('%s', (file) => {
    const doc = JSON.parse(readFileSync(`${WEB_SCORES}${file}`, 'utf8'));
    expect(validate(doc), ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
  });
});

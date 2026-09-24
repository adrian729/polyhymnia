import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'musicxml-to-mnx-test-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('cli', () => {
  it('writes a valid, id-assigned .mnx.json for a supported file', () => {
    const outPath = join(outDir, 'basic.mnx.json');
    execFileSync('node', [CLI, `${FIXTURES}basic.musicxml`, outPath]);
    const doc = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(doc.mnx.version).toBe(1);
    expect(doc.parts[0].measures[0].sequences[0].content[0].id).toBe('e0-0');
  });

  it('exits non-zero with readable output for an unsupported-construct file', () => {
    const outPath = join(outDir, 'simple-repeat.mnx.json');
    expect(() => execFileSync('node', [CLI, `${FIXTURES}simple-repeat.musicxml`, outPath], { stdio: 'pipe' })).toThrow();
  });

  it('rejects .mxl input with a readable message', () => {
    expect(() =>
      execFileSync('node', [CLI, `${FIXTURES}basic.mxl`, join(outDir, 'x.mnx.json')], { stdio: 'pipe' }),
    ).toThrow();
  });
});

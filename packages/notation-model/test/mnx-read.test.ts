import { describe, expect, it } from 'vitest';
import { readMnx, SUPPORTED_MNX_VERSION } from '../src/mnx/read.js';

describe('readMnx', () => {
  it('reads a document with the supported version', () => {
    const json = { mnx: { version: SUPPORTED_MNX_VERSION }, global: {}, parts: [] };
    const { doc, diagnostics } = readMnx(json);
    expect(diagnostics).toEqual([]);
    expect(doc).toBe(json);
  });

  it('rejects a document with no "mnx" key', () => {
    const { doc, diagnostics } = readMnx({ global: {}, parts: [] });
    expect(doc).toBeNull();
    expect(diagnostics[0]!.code).toBe('mnx-invalid');
  });

  it('rejects an unknown mnx.version', () => {
    const { doc, diagnostics } = readMnx({ mnx: { version: 999 } });
    expect(doc).toBeNull();
    expect(diagnostics[0]!.code).toBe('mnx-unsupported-version');
  });

});

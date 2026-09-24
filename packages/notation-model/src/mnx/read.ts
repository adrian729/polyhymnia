import type { MnxDocument } from './types.js';

export interface Diagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
  measureIndex?: number;
  voice?: 0 | 1;
  tick?: number;
}

export const SUPPORTED_MNX_VERSION = 1;

export interface ReadMnxResult {
  doc: MnxDocument | null;
  diagnostics: Diagnostic[];
}

export function readMnx(json: unknown): ReadMnxResult {
  if (typeof json !== 'object' || json === null) {
    return {
      doc: null,
      diagnostics: [
        { severity: 'error', code: 'mnx-invalid', message: 'MNX document must be an object' },
      ],
    };
  }

  const mnx = (json as { mnx?: unknown }).mnx;
  if (typeof mnx !== 'object' || mnx === null) {
    return {
      doc: null,
      diagnostics: [
        { severity: 'error', code: 'mnx-invalid', message: 'MNX document is missing "mnx"' },
      ],
    };
  }

  const version = (mnx as { version?: unknown }).version;
  if (version !== SUPPORTED_MNX_VERSION) {
    return {
      doc: null,
      diagnostics: [
        {
          severity: 'error',
          code: 'mnx-unsupported-version',
          message: `Unsupported mnx.version: ${JSON.stringify(version)} (expected ${SUPPORTED_MNX_VERSION})`,
        },
      ],
    };
  }

  return { doc: json as MnxDocument, diagnostics: [] };
}

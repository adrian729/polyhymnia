import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import { layoutScore, type LayoutResult } from '@polyhymnia/notation-engine';
import { readMnx, type Diagnostic } from '@polyhymnia/notation-model';

const SCHEMA_PATH = fileURLToPath(
  new URL('../../../packages/notation-model/schema/mnx-schema.json', import.meta.url),
);

export const UNSUPPORTED_ALLOWLIST: readonly string[] = [];

function isAllowedUnsupported(diagnostic: Diagnostic): boolean {
  if (diagnostic.code !== 'mnx-unsupported') return false;
  return UNSUPPORTED_ALLOWLIST.some((construct) =>
    diagnostic.message.startsWith(`Unsupported MNX: ${construct}`),
  );
}

let validateSchema: ((doc: unknown) => boolean) & { errors?: ErrorObject[] | null };

function getValidator(): typeof validateSchema {
  if (!validateSchema) {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    validateSchema = ajv.compile(schema) as typeof validateSchema;
  }
  return validateSchema;
}

export interface CheckProblem {
  kind: 'schema' | 'diagnostic';
  message: string;
}

export interface CheckResult {
  ok: boolean;
  problems: CheckProblem[];
  diagnostics: Diagnostic[];
  layout: LayoutResult | null;
}

export function check(doc: unknown): CheckResult {
  const problems: CheckProblem[] = [];

  const validate = getValidator();
  const schemaValid = validate(doc);
  if (!schemaValid) {
    for (const error of validate.errors ?? []) {
      problems.push({ kind: 'schema', message: `${error.instancePath || '/'} ${error.message ?? ''}`.trim() });
    }
    return { ok: false, problems, diagnostics: [], layout: null };
  }

  const { doc: parsed, diagnostics: readDiagnostics } = readMnx(doc);
  if (!parsed) {
    for (const d of readDiagnostics) problems.push({ kind: 'diagnostic', message: `[${d.code}] ${d.message}` });
    return { ok: false, problems, diagnostics: readDiagnostics, layout: null };
  }

  const layout = layoutScore(parsed);
  const diagnostics = [...readDiagnostics, ...layout.diagnostics];
  for (const d of diagnostics) {
    if (d.severity === 'error') {
      problems.push({ kind: 'diagnostic', message: `[${d.code}] ${d.message}` });
    } else if (d.code === 'mnx-unsupported' && !isAllowedUnsupported(d)) {
      problems.push({ kind: 'diagnostic', message: `[${d.code}] ${d.message}` });
    }
  }

  return { ok: problems.length === 0, problems, diagnostics, layout };
}

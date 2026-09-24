// DurationToken <-> Duration (interface.md token grammars).

import type { Duration, DurationBase } from '../model/types.js';
import type { DurationBaseToken, DurationToken } from '../model/tokens.js';

export type { DurationToken } from '../model/tokens.js';

const DURATION_RE = /^(b|w|h|q|16|32|64|8)(\.{0,2})$/;

const BASE_BY_TOKEN: Record<DurationBaseToken, DurationBase> = {
  b: 'breve',
  w: 'whole',
  h: 'half',
  q: 'quarter',
  '8': 'eighth',
  '16': '16th',
  '32': '32nd',
  '64': '64th',
};

const TOKEN_BY_BASE: Record<DurationBase, DurationBaseToken> = {
  breve: 'b',
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64',
};

function isDurationObject(value: unknown): value is Duration {
  return typeof value === 'object' && value !== null && 'base' in value;
}

/** Parse "q" / "q." / "8..", or pass an already-constructed `Duration` through. */
export function parseDuration(input: DurationToken | Duration): Duration {
  if (isDurationObject(input)) return normalizeDuration(input);
  const match = DURATION_RE.exec(input);
  if (!match) throw new SyntaxError(`Invalid duration token: ${JSON.stringify(input)}`);
  const [, base, dots] = match;
  return { base: BASE_BY_TOKEN[base as DurationBaseToken], dots: dots!.length as 0 | 1 | 2 };
}

function normalizeDuration(d: Duration): Duration {
  if (!(d.base in TOKEN_BY_BASE)) {
    throw new SyntaxError(`Invalid duration base: ${JSON.stringify(d.base)}`);
  }
  const dots = d.dots === 1 ? 1 : d.dots === 2 ? 2 : 0;
  return d.tuplet ? { base: d.base, dots, tuplet: d.tuplet } : { base: d.base, dots };
}

/** Inverse of `parseDuration` for the `{base, dots}` half. A tuplet ratio has no token
 *  form — `tuplet()` applies it structurally — so it is dropped here. */
export function formatDuration(d: Duration): DurationToken {
  return `${TOKEN_BY_BASE[d.base]}${'.'.repeat(d.dots ?? 0)}` as DurationToken;
}

export function isDurationToken(value: unknown): value is DurationToken {
  return typeof value === 'string' && DURATION_RE.test(value);
}

export interface Rational {
  readonly n: number;
  readonly d: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rational(n: number, d = 1): Rational {
  if (!Number.isFinite(n) || !Number.isFinite(d)) {
    throw new RangeError(`Rational requires finite values, got ${n}/${d}`);
  }
  if (d === 0) throw new RangeError('Rational denominator must be non-zero');
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new RangeError(`Rational requires integers, got ${n}/${d}`);
  }
  let nn = n;
  let dd = d;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  if (nn === 0) return { n: 0, d: 1 };
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

export const ZERO: Rational = { n: 0, d: 1 };
export const ONE: Rational = { n: 1, d: 1 };

export function add(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function subtract(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function multiply(a: Rational, b: Rational): Rational {
  return rational(a.n * b.n, a.d * b.d);
}

export function divide(a: Rational, b: Rational): Rational {
  if (b.n === 0) throw new RangeError('Rational division by zero');
  return rational(a.n * b.d, a.d * b.n);
}

export function equals(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function isZero(a: Rational): boolean {
  return a.n === 0;
}

export function min(a: Rational, b: Rational): Rational {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: Rational, b: Rational): Rational {
  return compare(a, b) >= 0 ? a : b;
}

function toExactTicks(a: Rational, divisions: number): number {
  return (a.n * 4 * divisions) / a.d;
}

export function toTicks(a: Rational, divisions: number): number {
  return Math.round(toExactTicks(a, divisions));
}

export function fromTicks(ticks: number, divisions: number): Rational {
  return rational(Math.round(ticks), 4 * divisions);
}

export function toNumber(a: Rational): number {
  return a.n / a.d;
}

export const Rational = {
  of: rational,
  ZERO,
  ONE,
  add,
  subtract,
  multiply,
  divide,
  equals,
  compare,
  isZero,
  min,
  max,
  toTicks,
  fromTicks,
  toNumber,
};

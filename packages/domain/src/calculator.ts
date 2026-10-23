import { parseAmount, sen, type Sen } from "./money";

/**
 * The keypad's calculator (D-115): "12.50+8" or "36÷4" typed as an amount. Only the result is
 * saved. The maths stays exact (fractions of whole sen, rule 1) and only the final result is
 * rounded to the sen, half-even (R-03), e.g. RM10 ÷ 3 = RM3.33.
 */

export const OPERATORS = ["÷", "×", "−", "+"] as const;
export type Operator = (typeof OPERATORS)[number];

export const isOperator = (c: string): c is Operator =>
  (OPERATORS as readonly string[]).includes(c);

/** An exact value in sen: n / d, with d > 0. */
interface Fraction {
  readonly n: bigint;
  readonly d: bigint;
}

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

function apply(a: Fraction, op: Operator, b: Fraction): Fraction | null {
  switch (op) {
    case "+":
      return { n: a.n * b.d + b.n * a.d, d: a.d * b.d };
    case "−":
      return { n: a.n * b.d - b.n * a.d, d: a.d * b.d };
    // RM3 × RM4.50 means 3 × 4.50 ringgit: (300 × 450) / 100 sen.
    case "×":
      return { n: a.n * b.n, d: a.d * b.d * HUNDRED };
    // RM36 ÷ RM4 means 36 ÷ 4 = 9 ringgit: (3600 × 100) / 400 sen.
    case "÷":
      return b.n === ZERO ? null : { n: a.n * b.d * HUNDRED, d: a.d * b.n };
  }
}

/** Half-even rounding of a non-negative fraction to whole sen (R-03). */
function roundToSen({ n, d }: Fraction): bigint {
  const q = n / d;
  const twice = TWO * (n % d);
  return twice > d || (twice === d && q % TWO === ONE) ? q + ONE : q;
}

/**
 * Splits a typed sum into numbers and operators: "12.5+8×2" → ["12.5", "+", "8", "×", "2"].
 * A trailing operator is ignored, so "12+" still shows RM12.00 while the next number is typed.
 */
export function sumParts(typed: string): string[] {
  const parts: string[] = [];
  let number = "";
  for (const c of typed) {
    if (isOperator(c)) {
      parts.push(number, c);
      number = "";
    } else number += c;
  }
  parts.push(number);
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.splice(-2, 2);
  return parts;
}

/** Whether the text is a sum (holds an operator) rather than a plain amount. */
export const isSum = (typed: string): boolean => sumParts(typed).length > 1;

/**
 * Works out a typed amount or sum as whole sen, × and ÷ before + and −. Null if it can't be read,
 * divides by zero, or comes out below zero.
 */
export function evaluateAmount(typed: string): Sen | null {
  const parts = sumParts(typed);
  const values: Fraction[] = [];
  const ops: Operator[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      ops.push(part as Operator);
      continue;
    }
    const amount = parseAmount(part);
    if (amount === null) return null;
    values.push({ n: BigInt(amount), d: ONE });
  }
  // First × and ÷, left to right, then + and −.
  const terms: Fraction[] = [values[0]!];
  const addOps: Operator[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op === "×" || op === "÷") {
      const next = apply(terms.pop()!, op, values[i + 1]!);
      if (next === null) return null;
      terms.push(next);
    } else {
      addOps.push(op);
      terms.push(values[i + 1]!);
    }
  }
  let total = terms[0]!;
  for (let i = 0; i < addOps.length; i++) total = apply(total, addOps[i]!, terms[i + 1]!)!;
  if (total.n < ZERO) return null;
  const rounded = Number(roundToSen(total));
  return Number.isSafeInteger(rounded) ? sen(rounded) : null;
}

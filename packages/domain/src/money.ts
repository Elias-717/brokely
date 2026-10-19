/**
 * Money rules: BR-01, BR-02 and NFR-01.
 *
 * - Every stored amount is a whole number of sen (RM1 = 100 sen).
 * - Sums are always exact integer arithmetic.
 * - Results of division (averages, daily rates) stay unrounded until they are
 *   displayed, then are rounded half-even to whole sen (R-03).
 */

declare const senBrand: unique symbol;

/** A whole number of sen. Use {@link sen} to create one. */
export type Sen = number & { readonly [senBrand]: true };

/** Turns a whole number into {@link Sen}, refusing fractions and unsafe integers. */
export function sen(value: number): Sen {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount must be a whole number of sen, got ${value}`);
  }
  return value as Sen;
}

/** Exact sum of amounts in sen. */
export function sumSen(amounts: readonly Sen[]): Sen {
  let total = 0;
  for (const amount of amounts) total += amount;
  return sen(total);
}

/**
 * Divides an amount by a count and keeps the exact result as a fraction
 * (e.g. a daily average). Round it only for display, with {@link roundHalfEven}.
 */
export interface SenRatio {
  readonly numerator: Sen;
  readonly denominator: number;
}

export function divideSen(numerator: Sen, denominator: number): SenRatio {
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`Divisor must be a positive whole number, got ${denominator}`);
  }
  return { numerator, denominator };
}

/**
 * Rounds a ratio to whole sen using half-even ("banker's") rounding.
 * Uses integer maths only, so there are no floating-point surprises.
 *
 * Examples: 1250 / 4 = 312.5 → 312; 1254 / 4 = 313.5 → 314.
 */
export function roundHalfEven({ numerator, denominator }: SenRatio): Sen {
  const negative = numerator < 0;
  const n = Math.abs(numerator);
  const quotient = Math.floor(n / denominator);
  const twiceRemainder = 2 * (n % denominator);

  let rounded = quotient;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2 === 1)) {
    rounded = quotient + 1;
  }
  return sen(negative ? -rounded : rounded);
}

/** Formats sen for display, e.g. 312 → "RM3.12", -500 → "-RM5.00". */
export function formatRM(amount: Sen): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const ringgit = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}RM${ringgit.toLocaleString("en-MY")}.${cents}`;
}

/**
 * Reads money a student typed ("250", "250.5", "RM 1,234.56") as whole sen, or null if it is
 * not an amount. Works on the digits as text, never on floating-point ringgit (BR-01, rule 1):
 * "0.29" is exactly 29 sen. At most two decimals; no signs, exponents or spaces inside.
 */
export function parseAmount(typed: string): Sen | null {
  const text = typed.trim().replace(/^rm\s*/i, "");
  const match = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const whole = (match[1] ?? "").replace(/,/g, "");
  const cents = match[2] ?? "";
  if (whole === "" && cents === "") return null; // "", "RM", "."
  const value = Number(whole || "0") * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? sen(value) : null;
}

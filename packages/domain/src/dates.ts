/**
 * Local calendar dates (BR-03). A LocalDate is a "YYYY-MM-DD" string in the student's time zone.
 * Dates never carry a time or time zone, so a cycle or a logged day can't move when the
 * time zone changes. ISO strings also sort correctly with < and >.
 */

declare const localDateBrand: unique symbol;
export type LocalDate = string & { readonly [localDateBrand]: true };

const MS_PER_DAY = 86_400_000;
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validates and brands a "YYYY-MM-DD" string. */
export function localDate(value: string): LocalDate {
  const match = PATTERN.exec(value);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new RangeError(`Not a real calendar date: ${value}`);
  }
  return value as LocalDate;
}

function toDayNumber(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromDayNumber(day: number): LocalDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10) as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
  return new Date(toDayNumber(date) * MS_PER_DAY).getUTCDay();
}

export function dayOfMonth(date: LocalDate): number {
  return Number(date.slice(8, 10));
}

export function lastDayOfMonth(date: LocalDate): number {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}

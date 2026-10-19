import { localDate, weekday, type LocalDate } from "@brokely/domain";

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A JS Date (from the phone's clock or a date picker) as a local calendar date (BR-03). */
export function toLocalDate(date: Date): LocalDate {
  return localDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
}

/** Today's date on the phone's clock, in the phone's time zone (BR-03). */
export function today(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

/** Midnight local time on that date, for a date picker. */
export function toDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

const parts = (date: LocalDate) => date.split("-").map(Number) as [number, number, number];

/** "15 Nov" — fixed English month names, so it reads the same on every phone. */
export function dayMonth(date: LocalDate): string {
  const [, m, d] = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "15 Nov 2026" */
export function dayMonthYear(date: LocalDate): string {
  return `${dayMonth(date)} ${parts(date)[0]}`;
}

/** "November" */
export function monthName(date: LocalDate): string {
  return MONTH_NAMES[parts(date)[1] - 1]!;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday" */
export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[weekday(date)]!;
}

/** Today's saves happen now; a save for another day is stamped at noon that day. */
export function occurredAtFor(date: LocalDate, day: LocalDate): string {
  if (date === day) return new Date().toISOString();
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).toISOString();
}

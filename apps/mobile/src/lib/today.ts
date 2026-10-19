import { localDate, type LocalDate } from "@brokely/domain";

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date on the phone's clock, in the phone's time zone (BR-03). */
export function today(now: Date = new Date()): LocalDate {
  return localDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
}

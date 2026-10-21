import {
  localDate,
  sen,
  type DateRange,
  type LocalDate,
  type RepeatRule,
  type Sen,
} from "@brokely/domain";
import {
  findCycleOn,
  getTransaction,
  listBills,
  listCategories,
  listScheduledItems,
  type BillView,
  type Db,
} from "@brokely/local-db";
import { dayMonth } from "./today";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Every Mon and Thu", "Monthly on the 5th", "Once, 5 Nov" (D-17). */
export function describeRepeat(rule: RepeatRule, anchor: LocalDate): string {
  switch (rule.kind) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const names = [...rule.days].sort().map((d) => DAYS[d]!);
      return names.length <= 1
        ? `Every ${names[0] ?? "week"}`
        : `Every ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    }
    case "every_n_days":
      return rule.n === 1 ? "Every day" : `Every ${rule.n} days`;
    case "every_n_weeks":
      return rule.n === 1 ? "Every week" : `Every ${rule.n} weeks`;
    case "monthly":
      return `Monthly on the ${ordinal(rule.day)}`;
    case "once":
      return `Once, ${dayMonth(anchor)}`;
  }
}

export interface BillItem {
  readonly id: string;
  readonly billId: string;
  readonly name: string;
  readonly categoryName: string;
  readonly dueDate: LocalDate;
  readonly amountSen: Sen;
  readonly status: "upcoming" | "paid" | "skipped";
  /** What was actually paid (Mark paid can change the amount, R-05). */
  readonly paidSen: Sen | null;
  readonly paidOn: LocalDate | null;
  readonly transactionId: string | null;
}

export type BillsModel = {
  readonly bills: readonly (BillView & {
    categoryName: string;
    describe: string;
    /** Its first date still to come in this plan (late ones first), if any. */
    next: LocalDate | null;
  })[];
  /** Null without a plan: items only exist inside a cycle (FR-CAT-04). */
  readonly items: readonly BillItem[] | null;
  /** The plan's dates, for "Plan ends 30 Nov". */
  readonly range: DateRange | null;
  /** The summary card (S6, D-77): what's still to come and what's paid in this plan. */
  readonly summary: {
    readonly stillToComeSen: Sen;
    readonly upcoming: number;
    readonly paidSen: Sen;
    readonly next: BillItem | null;
  } | null;
};

/** S6 Bills: this plan's bill dates and every live bill (FR-CAT-03…07). */
export function readBills(db: Db, today: LocalDate): BillsModel {
  const nameOf = new Map(listCategories(db, { includeArchived: true }).map((c) => [c.id, c.name]));
  const cycle = findCycleOn(db, today);
  const plain = listBills(db).map((b) => ({
    ...b,
    categoryName: nameOf.get(b.categoryId) ?? "Other",
    describe: describeRepeat(b.repeat, localDate(b.anchorDate)),
    next: null as LocalDate | null,
  }));
  if (!cycle) return { bills: plain, items: null, range: null, summary: null };

  const items = listScheduledItems(db, {
    start: cycle.startDate,
    endExclusive: cycle.endDateExclusive,
  }).map((i): BillItem => {
    const paid = i.transactionId ? getTransaction(db, i.transactionId) : undefined;
    return {
      id: i.id,
      billId: i.billId,
      name: i.billName,
      categoryName: nameOf.get(i.categoryId) ?? "Other",
      dueDate: localDate(i.dueDate),
      amountSen: sen(i.amountSen),
      status: i.status,
      paidSen: paid ? paid.amountSen : null,
      paidOn: paid ? paid.localDate : null,
      transactionId: i.transactionId,
    };
  });
  const upcoming = items.filter((i) => i.status === "upcoming"); // oldest first
  const nextOf = new Map<string, LocalDate>();
  for (const i of upcoming) if (!nextOf.has(i.billId)) nextOf.set(i.billId, i.dueDate);
  const bills = plain.map((b) => ({ ...b, next: nextOf.get(b.id) ?? null }));
  // The next one: the oldest still unpaid if it's late, otherwise the first from today.
  const next =
    upcoming.find((i) => i.dueDate < today) ?? upcoming.find((i) => i.dueDate >= today) ?? null;
  return {
    bills,
    items,
    range: { start: localDate(cycle.startDate), endExclusive: localDate(cycle.endDateExclusive) },
    summary: {
      stillToComeSen: sen(upcoming.reduce((sum, i) => sum + i.amountSen, 0)),
      upcoming: upcoming.length,
      paidSen: sen(items.reduce((sum, i) => sum + (i.status === "paid" ? (i.paidSen ?? 0) : 0), 0)),
      next,
    },
  };
}

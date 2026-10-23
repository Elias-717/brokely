import {
  divideSen,
  formatRM,
  roundHalfEven,
  sen,
  type LocalDate,
  type Period,
  type Sen,
} from "@brokely/domain";
import { dayMonth, monthName } from "./today";

/**
 * Everything Brokely says while planning (D-33). Fixed local templates filled with the student's
 * own numbers, never AI (rule 8, NFR-20). Wording rules (rule 9): fact first, exact amounts,
 * no shaming, never promise the student won't run out of money. Edit the words here.
 *
 * A line is a list of parts; `{ b: "…" }` is shown in bold.
 */
export type Line = readonly (string | { readonly b: string })[];

export const brokely = {
  greeting: (nickname: string | null): Line =>
    nickname ? ["Nice to meet you, ", { b: nickname }, "!"] : ["Let's set up your plan!"],

  askAlreadySpent: (today: LocalDate): Line => [
    `It's ${dayMonth(today)}. Have you already spent some of this month's money?`,
  ],

  freshMonth: (today: LocalDate, end: LocalDate): Line => [
    `It's ${dayMonth(today)}, a fresh month! How much do you have to spend until ${dayMonth(end)}?`,
  ],

  askLeft: (end: LocalDate): Line => [
    `Easy! How much do you have left to spend until ${dayMonth(end)}?`,
  ],

  perDay: (budget: Sen, days: number): Line => {
    const daily = roundHalfEven(divideSen(budget, days)); // display only (R-03)
    return days === 1
      ? [`${formatRM(budget)} for today.`]
      : [
          `${formatRM(budget)} for ${days} days, that's about `,
          { b: `${formatRM(daily)} a day` },
          ".",
        ];
  },

  confirmDates: (start: LocalDate, end: LocalDate): Line => [
    "Your plan runs ",
    { b: `${dayMonth(start)} – ${dayMonth(end)}` },
    ", both days included. Shall I set it up?",
  ],

  endBeforeStart: (): Line => [
    "The end date is before the start date. Let's pick the dates again.",
  ],

  askMonthMoney: (today: LocalDate): Line => [
    `Let's plan all of ${monthName(today)}. How much money do you have for ${monthName(today)} in total?`,
  ],

  askAlreadyGone: (): Line => ["And roughly how much is already gone? A guess is fine."],

  askMostlyOn: (): Line => ["What did it mostly go on?"],

  catchUpSummary: (budget: Sen, gone: Sen, today: LocalDate): Line => {
    const left = sen(budget - gone);
    const month = monthName(today);
    if (left < 0) {
      return [
        `That's ${formatRM(sen(-left))} more than your money for ${month}, so your plan starts below zero. That's okay, we'll plan from here. Your days count from today, ${dayMonth(today)}.`,
      ];
    }
    return [
      "So you have ",
      { b: `${formatRM(left)} left in plan` },
      ` for the rest of ${month}. Your days count from today, ${dayMonth(today)}.`,
    ];
  },

  askSetUp: (): Line => ["Shall I set it up?"],

  /**
   * D-46: what a healthy plan usually looks like for this budget. A suggestion only: nothing
   * is filled in, and each essential card suggests its own amount again.
   */
  healthyPlan: (
    budget: Sen,
    parts: readonly { name: string; percent: number; sen: Sen }[],
  ): Line => [
    `Tip: a healthy plan for ${formatRM(budget)} usually looks like `,
    ...parts.flatMap((p, i) => [
      i === 0 ? "" : i === parts.length - 1 ? " and " : ", ",
      { b: `${p.name.toLowerCase()} ${formatRM(p.sen)}` },
      ` (${p.percent}%)`,
    ]),
    ". Just a starting point; you choose your own amounts.",
  ],

  // Debts from before the plan (D-41). Paying back is never spending; it comes off the budget.
  askOwe: (): Line => [
    "Before we plan: do you owe anyone money from before? A friend, family, anyone.",
  ],

  askOweWho: (): Line => ["Who do you owe?"],

  askOweHowMuch: (name: string): Line => [`How much do you owe ${name} in total?`],

  askPayBack: (end: LocalDate): Line => [`Will you pay it back by ${dayMonth(end)}?`],

  askPayBackHowMuch: (end: LocalDate): Line => [`How much will you pay back by ${dayMonth(end)}?`],

  paybackNoted: (payback: Sen, name: string): Line => [
    "Got it: ",
    { b: formatRM(payback) },
    ` for ${name} comes out of your plan, so it's ready when you pay it back.`,
  ],

  paybackLater: (name: string): Line => [
    `Okay! I've saved what you owe ${name} in Debts. Nothing comes out of this plan.`,
  ],

  paybackMoreThanOwed: (owed: Sen, name: string): Line => [
    `That's more than the ${formatRM(owed)} you owe ${name}. How much will you pay back?`,
  ],

  paybackLeavesNothing: (room: Sen): Line => [
    `That would leave nothing to plan with. Try less than ${formatRM(room)}.`,
  ],

  askOweMore: (): Line => ["Anyone else you owe?"],

  askOwedToYou: (): Line => ["And does anyone owe you money?"],

  askOwedWho: (): Line => ["Who owes you?"],

  askOwedHowMuch: (name: string): Line => [`How much does ${name} owe you?`],

  owedNoted: (name: string): Line => [
    `Saved in Debts so you don't forget. Your plan doesn't count on it until ${name} pays you back.`,
  ],

  askOwedMore: (): Line => ["Anyone else?"],

  paybackSummary: (money: Sen, payback: Sen, budget: Sen): Line => [
    `${formatRM(money)} − ${formatRM(payback)} to pay back = `,
    { b: formatRM(budget) },
    " for your plan.",
  ],

  couldNotRead: (): Line => ["Hmm, I couldn't read that. Try something like 250 or 250.50."],

  needMoreThanZero: (): Line => ["I need an amount above zero to plan with."],

  planIsSet: (nickname: string | null): Line => [
    nickname ? `Your plan is set, ${nickname}!` : "Your plan is set!",
  ],

  planSummary: (leftInPlan: Sen, days: number): Line => [
    "You have ",
    { b: formatRM(leftInPlan) },
    ` for the next ${days === 1 ? "day" : `${days} days`}. Let's cover your essentials together, one at a time.`,
  ],
};

/** "1 wash", "2 washes", "2 top-ups". */
const plural = (unit: string, n: number) =>
  n === 1 ? unit : unit.endsWith("sh") ? `${unit}es` : `${unit}s`;

const PER: Record<Period, string> = { day: "a day", week: "a week", month: "a month" };
const PERIODS: Record<Period, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

/**
 * Brokely's one line under the greeting on Home (D-58): fact first, kind, never shaming
 * (rule 9), never a balance (rule 6).
 */
export const homeStatus: Record<
  "fresh" | "on-plan" | "ahead" | "over" | "nothing-free" | "today-over",
  string
> = {
  fresh: "Fresh start! Log your first spending when it happens.",
  "on-plan": "You're on plan. Nice going!",
  "nothing-free": "Bills still to come need what's left.",
  "today-over": "Today went a bit over. Tomorrow's a fresh start.",
  ahead: "Spending is running a bit ahead of plan. Small days help.",
  over: "The plan is used up. Keep logging, every record still helps.",
};

/** What Brokely says in an essential-card chat (D-35, D-36). */
export const essentialLines = {
  intro: (intro: string, emoji: string): Line => [`${intro} ${emoji}`],

  askHowOften: (name: string): Line => [`How often do you spend on ${name.toLowerCase()}?`],

  /** D-46: a suggestion before the question; the student still types their own amount. */
  healthyHint: (name: string, percent: number, total: Sen, perDay: Sen | null): Line => [
    `A healthy plan puts about ${percent}% into ${name.toLowerCase()}: around `,
    { b: perDay !== null ? `${formatRM(perDay)} a day` : formatRM(total) },
    perDay !== null ? " for you." : " for this plan.",
  ],

  askHowMuch: (per: Period): Line => [`About how much ${PER[per]}?`],

  /** Meals (D-42): no "how often", everyone eats every day. */
  askDaily: (): Line => [
    "About how much do you spend on food ",
    { b: "a day" },
    "? Breakfast, lunch, dinner and drinks together. A guess is fine.",
  ],

  askCount: (unit: string): Line =>
    unit === "wash"
      ? ["About how many times do you wash a ", { b: "month" }, "? A guess is fine."]
      : ["About how many ", { b: `${unit}s a month` }, "? A guess is fine."],

  askEach: (unit: string): Line => [`About how much each ${unit}?`],

  countedFour: (): Line => ["I'll count 4 a month. You can always change it later."],

  workingOften: (each: Sen, per: Period, times: number, total: Sen, end: LocalDate): Line => {
    const [one, many] = PERIODS[per];
    return [
      `${formatRM(each)} × ${times} ${times === 1 ? one : many} = `,
      { b: formatRM(total) },
      ` until ${dayMonth(end)}.`,
    ];
  },

  workingCount: (
    perMonth: number,
    unit: string,
    each: Sen,
    times: number,
    total: Sen,
    end: LocalDate,
  ): Line => [
    `${perMonth} a month ≈ ${times} ${plural(unit, times)} until ${dayMonth(end)}: ${times} × ${formatRM(each)} = `,
    { b: formatRM(total) },
    ".",
  ],

  notSure: (unit: string): Line => [
    `No problem! Log each ${unit} when it happens, and I'll suggest an amount once I've seen a few.`,
  ],

  askBillOrTopUp: (): Line => [
    "Do you pay a monthly bill on a set day, or top up when it runs out?",
  ],

  askBillDate: (): Line => ["When is the next bill due?"],

  askBillAmount: (): Line => ["How much is the bill?"],

  workingBill: (count: number, each: Sen, total: Sen, end: LocalDate): Line =>
    count === 0
      ? [
          `Your next bill is after ${dayMonth(end)}, so there's nothing to set aside in this plan. I'll still keep the bill for next time.`,
        ]
      : [
          `${count} ${count === 1 ? "bill" : "bills"} until ${dayMonth(end)}: ${count} × ${formatRM(each)} = `,
          { b: formatRM(total) },
          ". I'll show it in Still to come.",
        ],

  /** R-14: the catch-up spending in this category stays planned, the card adds on top. */
  plusBefore: (before: Sen, name: string, total: Sen): Line => [
    `Plus ${formatRM(before)} you spent on ${name.toLowerCase()} before Brokely, so ${name} is `,
    { b: formatRM(total) },
    " in your plan.",
  ],

  leaves: (left: Sen, name: string): Line => [
    "That leaves ",
    { b: formatRM(left) },
    ` not planned yet. Add ${name.toLowerCase()} to your plan?`,
  ],

  /** The D-28 acknowledgement, in Brokely's words (FR-PLN-10). */
  over: (overBy: Sen, budget: Sen): Line => [
    "That takes your plan ",
    { b: `${formatRM(overBy)} over` },
    ` your ${formatRM(budget)}. Add it anyway?`,
  ],

  added: (name: string, total: Sen): Line =>
    total > 0
      ? ["Done! ", { b: formatRM(total) }, ` for ${name.toLowerCase()} is in your plan.`]
      : [`Done! ${name} is set up.`],
};

/** Plain text of a line, for screen readers. */
export function plain(line: Line): string {
  return line.map((part) => (typeof part === "string" ? part : part.b)).join("");
}

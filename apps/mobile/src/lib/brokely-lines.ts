import { divideSen, formatRM, roundHalfEven, sen, type LocalDate, type Sen } from "@brokely/domain";
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
    nickname ? ["Nice to meet you, ", { b: nickname }, "! 🥦"] : ["Let's set up your plan! 🥦"],

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

/** Plain text of a line, for screen readers. */
export function plain(line: Line): string {
  return line.map((part) => (typeof part === "string" ? part : part.b)).join("");
}

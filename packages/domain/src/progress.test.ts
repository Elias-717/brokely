import { describe, expect, it } from "vitest";
import { cycleFromInclusive } from "./cycle";
import { addDays, localDate, type LocalDate } from "./dates";
import { formatRM, roundHalfEven, sen } from "./money";
import {
  checkCheckInDate,
  computeProgress,
  percentHalfEven,
  type ProgressInput,
  type ScheduledItemLike,
  forecastCanShow,
} from "./progress";
import { cat, purchase, spend, txn } from "./test-fixtures";
import type { Transaction } from "./transactions";

const d = localDate;
/** 30-day cycle used by AC-13/AC-14: 2 Nov – 1 Dec 2026. */
const cycle30 = cycleFromInclusive(d("2026-11-02"), d("2026-12-01"));
const day = (n: number): LocalDate => addDays(cycle30.start, n - 1);

function progress(over: Partial<ProgressInput>) {
  return computeProgress({
    range: cycle30,
    today: day(1),
    transactions: [],
    checkIns: [],
    scheduledItems: [],
    plannedSpendingSen: sen(33000),
    budgetSen: sen(40000),
    debtDirectionOf: () => undefined,
    ...over,
  });
}

/** One meals purchase per day for days 1..n (amount each). */
function dailyMeals(n: number, amount: number): Transaction[] {
  return Array.from({ length: n }, (_, i) => purchase(cat.meals, amount, day(i + 1)));
}

describe("elapsed days (BR-16, R-06, AC-15)", () => {
  it("does not count today until it is covered", () => {
    const morningOfDay3 = progress({ today: day(3), transactions: dailyMeals(2, 800) });
    expect(morningOfDay3.elapsedDays).toBe(2);
    const afterLogging = progress({
      today: day(3),
      transactions: [...dailyMeals(2, 800), purchase(cat.meals, 500, day(3))],
    });
    expect(afterLogging.elapsedDays).toBe(3);
  });

  it("counts the whole cycle after it ends, with no days left", () => {
    const done = progress({ today: d("2026-12-05") });
    expect(done.elapsedDays).toBe(30);
    expect(done.daysLeft).toBe(0);
  });

  it("is zero before the cycle starts, with no averages", () => {
    const before = progress({ today: d("2026-11-01") });
    expect(before.elapsedDays).toBe(0);
    expect(before.dailyAverage).toBe(null);
    expect(before.coverage).toBe(null);
  });
});

describe("covered days (BR-15, R-01, AC-30)", () => {
  it("counts a 'No spending today' check-in as covered", () => {
    const p = progress({ today: day(2), transactions: dailyMeals(1, 800), checkIns: [day(2)] });
    expect(p.coveredDays).toBe(2);
    expect(p.elapsedDays).toBe(2);
  });

  it("never counts estimates as covered days (D-15, AC-51)", () => {
    const estimates = [day(2), day(3), day(4)].map((date) =>
      txn("purchase", 1600, [spend(cat.meals, 1600)], { date, isEstimate: true }),
    );
    const p = progress({ today: day(5), transactions: [...dailyMeals(1, 800), ...estimates] });
    expect(p.spentSen).toBe(800 + 4800);
    expect(p.coveredDays).toBe(1);
    expect(p.everydayRate).toEqual({ numerator: 800, denominator: 4 }); // estimates left out
  });
});

describe("daily average (BR-18, AC-16)", () => {
  it("shows RM12.50 over 4 elapsed days as RM3.12 (half-even)", () => {
    const p = progress({
      today: day(4),
      transactions: [purchase(cat.meals, 1250, day(1))],
      checkIns: [day(2), day(3), day(4)],
    });
    expect(p.elapsedDays).toBe(4);
    expect(p.dailyAverage).toEqual({ numerator: 1250, denominator: 4 });
    expect(p.dailyAverage && formatRM(roundHalfEven(p.dailyAverage))).toBe("RM3.12");
  });
});

describe("still to come (BR-19, AC-19)", () => {
  it("adds upcoming bills without changing spending", () => {
    const items: ScheduledItemLike[] = [
      { dueDate: day(20), amountSen: sen(1600), status: "upcoming", transactionId: null },
      { dueDate: day(25), amountSen: sen(900), status: "skipped", transactionId: null },
      { dueDate: d("2026-12-10"), amountSen: sen(500), status: "upcoming", transactionId: null },
    ];
    const p = progress({ today: day(3), transactions: dailyMeals(3, 800), scheduledItems: items });
    expect(p.stillToComeSen).toBe(1600);
    expect(p.spentSen).toBe(2400);
  });
});

describe("bills are never counted twice (BR-14, R-05, AC-12)", () => {
  it("moves a bill from still to come to spending when marked paid", () => {
    const upcoming: ScheduledItemLike = {
      dueDate: day(5),
      amountSen: sen(2000),
      status: "upcoming",
      transactionId: null,
    };
    const before = progress({ today: day(5), scheduledItems: [upcoming] });
    expect(before.stillToComeSen + before.spentSen).toBe(2000);

    const payment = purchase(cat.phone, 2200, day(5)); // Mark paid with RM22
    const paid = { ...upcoming, status: "paid" as const, transactionId: payment.id };
    const after = progress({ today: day(5), transactions: [payment], scheduledItems: [paid] });
    expect(after.stillToComeSen).toBe(0);
    expect(after.spentSen).toBe(2200);
  });
});

describe("forecast gate (BR-17, R-09, AC-14)", () => {
  it("hides the forecast on day 15 with only 9 logged days (60%)", () => {
    const logged = [...dailyMeals(8, 1000), purchase(cat.meals, 1000, day(15))];
    const p = progress({ today: day(15), transactions: logged });
    expect(p.elapsedDays).toBe(15);
    expect(p.coverage && percentHalfEven(p.coverage)).toBe(60);
    expect(p.forecast).toBe(null);
  });

  it("hides the forecast on day 10 even with every day logged", () => {
    const p = progress({ today: day(10), transactions: dailyMeals(10, 1000) });
    expect(p.forecast).toBe(null);
    expect(p.dailyAverage).toEqual({ numerator: 10000, denominator: 10 });
  });
});

describe("forecast range and pace (BR-20, BR-21, R-10, AC-13)", () => {
  // End of day 15, all 15 days logged, RM180 spent of which RM20 is a paid bill.
  const phoneBill = purchase(cat.phone, 2000, day(5));
  const meals = [...dailyMeals(15, 1000), purchase(cat.meals, 1000, day(15))]; // RM160
  const transactions = [...meals, phoneBill];
  const scheduledItems: ScheduledItemLike[] = [
    { dueDate: day(5), amountSen: sen(2000), status: "paid", transactionId: phoneBill.id },
    { dueDate: day(20), amountSen: sen(1600), status: "upcoming", transactionId: null },
    { dueDate: day(28), amountSen: sen(1400), status: "upcoming", transactionId: null },
  ];
  const p = progress({ today: day(15), transactions, scheduledItems });

  it("sets up the SRS example exactly", () => {
    expect(p.spentSen).toBe(18000);
    expect(p.elapsedDays).toBe(15);
    expect(p.daysLeft).toBe(15);
    expect(p.stillToComeSen).toBe(3000);
    expect(p.everydayRate).toEqual({ numerator: 16000, denominator: 15 }); // bill left out
  });

  it("forecasts a middle of RM370 and a range of RM340–RM400", () => {
    expect(p.forecast).not.toBe(null);
    if (!p.forecast) return;
    expect(formatRM(roundHalfEven(p.forecast.middle))).toBe("RM370.00");
    expect(p.forecast.lowSen).toBe(34000); // 346 rounded down
    expect(p.forecast.highSen).toBe(40000); // 394 rounded up
  });

  it("is over pace against RM330 planned spending, on track against RM380", () => {
    expect(p.forecast?.pace).toBe("over_pace");
    const relaxed = progress({
      today: day(15),
      transactions,
      scheduledItems,
      plannedSpendingSen: sen(38000),
    });
    expect(relaxed.forecast?.pace).toBe("on_track");
  });

  it("compares with the budget while no category has an amount yet (R-11, AC-56)", () => {
    // Quick start (D-23): budget only, P = 0. Middle RM370.
    const quick = (budget: number) =>
      progress({
        today: day(15),
        transactions,
        scheduledItems,
        plannedSpendingSen: sen(0),
        budgetSen: sen(budget),
      });
    expect(quick(40000).forecast?.pace).toBe("on_track");
    expect(quick(35000).forecast?.pace).toBe("over_pace");
  });
});

describe("catch-up month: progress counts from the day the student joined (BR-29, R-12, AC-60)", () => {
  // Joined on day 15 after "Catch me up": RM350 spent before Brokely (dated day 14),
  // then RM10 meals every day from day 15 to day 28.
  const opening = purchase(cat.meals, 35000, day(14));
  const meals = Array.from({ length: 14 }, (_, i) => purchase(cat.meals, 1000, day(15 + i)));
  const transactions = [opening, ...meals];
  const joined = progress({ today: day(28), transactions, trackingStart: day(15) });

  it("counts spending before joining in N but not in the daily figures", () => {
    expect(joined.spentSen).toBe(49000);
    expect(joined.elapsedDays).toBe(14);
    expect(joined.coveredDays).toBe(14);
    expect(joined.dailyAverage).toEqual({ numerator: 14000, denominator: 14 }); // RM10 a day
    expect(joined.everydayRate).toEqual({ numerator: 14000, denominator: 14 });
    expect(joined.daysLeft).toBe(2);
  });

  it("shows the forecast 14 days after joining: 490 + 10 × 2 = RM510", () => {
    expect(joined.forecast).not.toBe(null);
    if (!joined.forecast) return;
    expect(formatRM(roundHalfEven(joined.forecast.middle))).toBe("RM510.00");
  });

  it("would hide the forecast if the days before joining counted as missed", () => {
    const fromFirst = progress({ today: day(28), transactions });
    expect(fromFirst.elapsedDays).toBe(28);
    expect(fromFirst.forecast).toBe(null); // 14 of 28 logged = 50%
  });
});

describe("forecastCanShow (D-37)", () => {
  it("a 12-day plan never reaches day 14, so no forecast line at all", () => {
    expect(forecastCanShow(12)).toBe(false);
  });

  it("plans of 14 days or more keep the usual gate (BR-17)", () => {
    expect(forecastCanShow(14)).toBe(true);
    expect(forecastCanShow(30)).toBe(true);
  });
});

describe("no-spend days for earlier dates (R-01, D-60)", () => {
  it("accepts today and earlier days, refuses tomorrow", () => {
    const today = localDate("2026-10-21");
    expect(checkCheckInDate(localDate("2026-10-21"), today).ok).toBe(true);
    expect(checkCheckInDate(localDate("2026-10-19"), today).ok).toBe(true);
    expect(checkCheckInDate(localDate("2026-10-22"), today)).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });
});

import { describe, expect, it } from "vitest";
import { localDate } from "./dates";
import { sen } from "./money";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_TEMPLATES,
  planNotifications,
  type NotificationInput,
} from "./notifications";

const day = (d: number) => localDate(`2026-10-${String(d).padStart(2, "0")}`);

const base = (over: Partial<NotificationInput> = {}): NotificationInput => ({
  today: day(22),
  now: "07:00",
  horizonDays: 3,
  settings: DEFAULT_NOTIFICATION_SETTINGS,
  bills: [],
  debts: [],
  loggedToday: false,
  pace: null,
  lastPaceDate: null,
  streak: { days: 0, celebrated: 0 },
  ...over,
});

describe("notifications (FR-NOT-01…07, D-07, D-45, D-94)", () => {
  it("every type has at least three wordings, the cheeky evening ones too (FR-NOT-03)", () => {
    for (const [kind, variants] of Object.entries(NOTIFICATION_TEMPLATES)) {
      expect(variants.length, kind).toBeGreaterThanOrEqual(3);
    }
  });

  it("a bill reminds at 9:00 on its due date and opens Mark paid (D-45, FR-NOT-07, AC-41)", () => {
    const planned = planNotifications(
      base({
        loggedToday: true,
        bills: [{ itemId: "item-1", name: "Laundry", amountSen: sen(1600), dueDate: day(23) }],
      }),
    );
    const bills = planned.filter((n) => n.kind === "bill_due");
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      kind: "bill_due",
      date: day(23),
      time: "09:00",
      url: "/bills/pay/item-1",
    });
    expect(`${bills[0]!.title} ${bills[0]!.body}`).toContain("RM16.00");
    expect(`${bills[0]!.title} ${bills[0]!.body}`).toContain("Laundry");
  });

  it("the evening check-in is skipped today once something is logged, and kept for the next days", () => {
    const notLogged = planNotifications(base({ now: "12:00" }));
    expect(notLogged.filter((n) => n.kind === "evening").map((n) => n.date)).toEqual([
      day(22),
      day(23),
      day(24),
    ]);
    const logged = planNotifications(base({ now: "12:00", loggedToday: true }));
    expect(logged.filter((n) => n.kind === "evening").map((n) => n.date)).toEqual([
      day(23),
      day(24),
    ]);
  });

  it("never schedules in the past", () => {
    const planned = planNotifications(base({ now: "21:00" }));
    expect(planned.some((n) => n.date === day(22))).toBe(false);
  });

  it("never repeats the same wording on two days in a row (FR-NOT-03)", () => {
    const evenings = planNotifications(base({ horizonDays: 7 })).filter(
      (n) => n.kind === "evening",
    );
    for (let i = 1; i < evenings.length; i++) {
      expect(evenings[i]!.body).not.toBe(evenings[i - 1]!.body);
    }
  });

  it("the same plan run twice gives the same wording, so rescheduling never changes it", () => {
    expect(planNotifications(base())).toEqual(planNotifications(base()));
  });

  it("cheeky tone uses the cheeky evening lines; friendly the plain ones", () => {
    const cheeky = planNotifications(
      base({ settings: { ...DEFAULT_NOTIFICATION_SETTINGS, tone: "cheeky" }, horizonDays: 5 }),
    );
    const cheekyBodies = new Set(NOTIFICATION_TEMPLATES.evening_cheeky.map((t) => t.body));
    expect(cheeky.filter((n) => n.kind === "evening").every((n) => cheekyBodies.has(n.body))).toBe(
      true,
    );
  });

  it("quiet hours: a morning one waits until they end; a late one is dropped (FR-NOT-06)", () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      quietStart: "22:00",
      quietEnd: "09:30",
      eveningTime: "22:30",
    };
    const planned = planNotifications(
      base({
        settings,
        bills: [{ itemId: "b", name: "Phone", amountSen: sen(3500), dueDate: day(23) }],
      }),
    );
    expect(planned.find((n) => n.kind === "bill_due")?.time).toBe("09:30");
    expect(planned.some((n) => n.kind === "evening")).toBe(false);
  });

  it("at most 3 a day, the most useful first: bills, debts, evening, pace, streak (FR-NOT-06)", () => {
    const planned = planNotifications(
      base({
        horizonDays: 1,
        bills: [
          { itemId: "1", name: "Laundry", amountSen: sen(1600), dueDate: day(22) },
          { itemId: "2", name: "Phone", amountSen: sen(3500), dueDate: day(22) },
        ],
        debts: [
          {
            id: "d",
            name: "Ali",
            outstandingSen: sen(2000),
            dueDate: day(22),
            owedToMe: true,
          },
        ],
        settings: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          kinds: { ...DEFAULT_NOTIFICATION_SETTINGS.kinds, pace: true },
        },
        pace: { overPace: true, forecastSen: sen(43000), plannedSen: sen(40000) },
        streak: { days: 3, celebrated: 0 },
      }),
    );
    expect(planned.map((n) => n.kind)).toEqual(["bill_due", "bill_due", "debt_due"]);
  });

  it("each type and the master switch can be turned off (FR-NOT-05)", () => {
    const bills = [{ itemId: "1", name: "Laundry", amountSen: sen(1600), dueDate: day(23) }];
    const noBills = planNotifications(
      base({
        bills,
        settings: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          kinds: { ...DEFAULT_NOTIFICATION_SETTINGS.kinds, bill_due: false },
        },
      }),
    );
    expect(noBills.some((n) => n.kind === "bill_due")).toBe(false);
    const muted = planNotifications(
      base({ bills, settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false } }),
    );
    expect(muted).toEqual([]);
  });

  it("pace: only when over pace, at most once a week, never shaming (D-07)", () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      kinds: { ...DEFAULT_NOTIFICATION_SETTINGS.kinds, pace: true },
    };
    const pace = { overPace: true, forecastSen: sen(43000), plannedSen: sen(40000) };
    const due = planNotifications(base({ settings, pace, loggedToday: true }));
    expect(due.find((n) => n.kind === "pace")).toMatchObject({ date: day(22), url: "/insights" });
    expect(`${due.find((n) => n.kind === "pace")!.body}`).toContain("RM430.00");
    const tooSoon = planNotifications(base({ settings, pace, lastPaceDate: day(18) }));
    expect(tooSoon.some((n) => n.kind === "pace")).toBe(false);
    const sameDay = planNotifications(base({ settings, pace, lastPaceDate: day(22) }));
    expect(sameDay.some((n) => n.kind === "pace")).toBe(true); // a re-plan keeps today's
    const onTrack = planNotifications(base({ settings, pace: { ...pace, overPace: false } }));
    expect(onTrack.some((n) => n.kind === "pace")).toBe(false);
  });

  it("streak: celebrates 3, 7, 14… days once each", () => {
    const at3 = planNotifications(base({ streak: { days: 3, celebrated: 0 } }));
    expect(at3.find((n) => n.kind === "streak")?.title).toContain("3");
    const again = planNotifications(base({ streak: { days: 3, celebrated: 3 } }));
    expect(again.some((n) => n.kind === "streak")).toBe(false);
    const notMilestone = planNotifications(base({ streak: { days: 5, celebrated: 3 } }));
    expect(notMilestone.some((n) => n.kind === "streak")).toBe(false);
  });

  it("a debt due back opens that debt, worded for who owes whom", () => {
    const planned = planNotifications(
      base({
        loggedToday: true,
        debts: [
          { id: "d1", name: "Ali", outstandingSen: sen(2000), dueDate: day(22), owedToMe: true },
          { id: "d2", name: "Sara", outstandingSen: sen(1500), dueDate: day(23), owedToMe: false },
        ],
      }),
    );
    const [toMe, iOwe] = planned.filter((n) => n.kind === "debt_due");
    expect(toMe).toMatchObject({ url: "/debts/d1" });
    expect(`${toMe!.title} ${toMe!.body}`).toContain("Ali");
    expect(`${iOwe!.title} ${iOwe!.body}`).toContain("Sara");
    expect(`${iOwe!.title} ${iOwe!.body}`).toContain("RM15.00");
  });
});

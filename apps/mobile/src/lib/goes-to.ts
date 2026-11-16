import {
  defaultGoesTo,
  formatRM,
  offersToday,
  planAfterMoneyIn,
  sen,
  type LocalDate,
  type MoneyInGoesTo,
  type Sen,
} from "@brokely/domain";
import { findCycleOn, getPlan, type CategoryRow } from "@brokely/local-db";
import { useRead } from "../db/use-read";
import type { IconName } from "../ui/icon";
import { readDebts } from "./debts-model";

const PLAN = "plan";
const TODAY = "today";
const RECORD = "record";

/** A Goes to choice as the picker's id: "plan", "today", "record", "set_aside:<id>", "debt:<id>". */
function idOf(goesTo: MoneyInGoesTo): string {
  if (goesTo.kind === "set_aside") return `set_aside:${goesTo.categoryId}`;
  if (goesTo.kind === "debt") return `debt:${goesTo.debtId}`;
  return goesTo.kind;
}

function fromId(id: string): MoneyInGoesTo {
  if (id.startsWith("set_aside:")) return { kind: "set_aside", categoryId: id.slice(10) };
  if (id.startsWith("debt:")) return { kind: "debt", debtId: id.slice(5) };
  if (id === TODAY) return { kind: "today" };
  if (id === RECORD) return { kind: "record" };
  return { kind: "plan" };
}

export interface GoesTo {
  /** The plan the money in falls in, by its date; null when there is none. */
  readonly cycleId: string | null;
  /** The picker's choices; empty when there is no plan (then it is only recorded). */
  readonly options: { id: string; name: string }[];
  readonly selectedId: string;
  readonly choice: MoneyInGoesTo;
  /** One line under the row, in numbers: what happens to the plan. */
  readonly detail: string;
  /** "Add RMx to today instead?" (D-134). */
  readonly offerToday: boolean;
  readonly saveLabel: string;
  /** The Undo bar's words after saving. */
  readonly savedMessage: string;
  /** Added to the plan change's reason, e.g. " · to Savings" (D-139). */
  readonly reasonSuffix: string;
  readonly iconOf: (name: string) => IconName;
}

/**
 * The Money in sheet's "Goes to" row (D-130, D-134): the choices for the plan on that date,
 * the default from the source, and the words for the row, the button and the Undo bar.
 */
export function useGoesTo({
  date,
  day,
  from,
  amount,
  chosenId,
  categories,
}: {
  date: LocalDate;
  day: LocalDate;
  from: string;
  amount: Sen | null;
  chosenId: string | null;
  categories: readonly CategoryRow[];
}): GoesTo {
  const plan = useRead(
    (db) => {
      const cycle = findCycleOn(db, date);
      return cycle ? (getPlan(db, cycle.id) ?? null) : null;
    },
    [date],
  );
  const owe = useRead((db) => readDebts(db).iOwe, []);
  const typed = amount !== null && amount > 0 ? amount : sen(0);
  const rm = formatRM(typed);

  const setAsides = categories.filter((c) => c.kind === "set_aside" && !c.archivedAt);
  const savings = setAsides.find((c) => c.name === "Savings") ?? null;
  const nameOf = (id: string) => setAsides.find((c) => c.id === id)?.name ?? "the set-aside";

  if (!plan) {
    return {
      cycleId: null,
      options: [],
      selectedId: RECORD,
      choice: { kind: "record" },
      detail: "",
      offerToday: false,
      saveLabel: typed > 0 ? `Save money in · ${rm}` : "Save",
      savedMessage: "",
      reasonSuffix: "",
      iconOf: () => "coins",
    };
  }

  const isToday = date === day;
  const options = [
    { id: PLAN, name: "This month's plan" },
    // Today only for money dated today: it goes on top of today's share (D-134).
    ...(isToday ? [{ id: TODAY, name: "Today" }] : []),
    ...setAsides.map((c) => ({ id: `set_aside:${c.id}`, name: c.name })),
    ...owe.map((d) => ({ id: `debt:${d.id}`, name: `Pay back ${d.name}` })),
    { id: RECORD, name: "Just record it" },
  ];
  const fallback = idOf(defaultGoesTo(from, savings?.id ?? null));
  const selectedId = options.some((o) => o.id === chosenId) ? chosenId! : fallback;
  const choice = fromId(selectedId);

  const budget = sen(plan.revision.budgetSen);
  const amounts = {
    budgetSen: budget,
    allocations: plan.allocations.map((a) => ({
      categoryId: a.categoryId,
      amountSen: sen(a.amountSen),
    })),
  };
  const next = planAfterMoneyIn(amounts, typed, choice);
  const debt = choice.kind === "debt" ? owe.find((d) => d.id === choice.debtId) : undefined;

  let detail: string;
  let saveLabel: string;
  let savedMessage: string;
  switch (choice.kind) {
    case "plan":
      detail = `Your plan goes from ${formatRM(budget)} to ${formatRM(next?.budgetSen ?? budget)}`;
      saveLabel = `Save · ${rm} to your plan`;
      savedMessage = `${rm} added to your plan`;
      break;
    case "today":
      detail = `All of it on top of today's share · plan ${formatRM(next?.budgetSen ?? budget)}`;
      saveLabel = `Save · ${rm} to today`;
      savedMessage = `${rm} added to today`;
      break;
    case "set_aside": {
      const name = nameOf(choice.categoryId);
      const had = amounts.allocations.find((a) => a.categoryId === choice.categoryId);
      const was = had?.amountSen ?? sen(0);
      detail = `${name} goes from ${formatRM(was)} to ${formatRM(sen(was + typed))}. Not for spending.`;
      saveLabel = `Save · ${rm} to ${name}`;
      savedMessage = `${rm} put in ${name}`;
      break;
    }
    case "debt":
      detail = debt
        ? `You owe ${debt.name} ${formatRM(debt.outstandingSen)}. Paying back comes next.`
        : "Paying back comes next.";
      saveLabel = `Save · then pay back ${debt?.name ?? ""}`.trim();
      savedMessage = `Saved money in ${rm}`;
      break;
    default:
      detail = `Your plan stays at ${formatRM(budget)}. You can add it later from Home.`;
      saveLabel = `Save money in · ${rm}`;
      savedMessage = `${rm} recorded · plan unchanged`;
  }
  if (typed <= 0) saveLabel = "Save";

  return {
    cycleId: plan.cycle.id,
    options,
    selectedId,
    choice,
    detail,
    offerToday: isToday && choice.kind === "plan" && offersToday(typed),
    saveLabel,
    savedMessage,
    reasonSuffix:
      choice.kind === "today"
        ? " · to today"
        : choice.kind === "set_aside"
          ? ` · to ${nameOf(choice.categoryId)}`
          : "",
    iconOf: (name) =>
      name === "This month's plan"
        ? "calendar-check"
        : name === "Today"
          ? "sun"
          : name === "Just record it"
            ? "receipt"
            : name.startsWith("Pay back")
              ? "hand-coins"
              : "piggy-bank",
  };
}

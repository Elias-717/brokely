import {
  billSuggestion,
  dayOfMonth,
  essentialAllocation,
  essentialSuggestion,
  formatRM,
  healthySuggestion,
  inclusiveEnd,
  lastDayOfMonth,
  lengthInDays,
  localDate,
  parseAmount,
  sen,
  spendingByCategory,
  unplannedSen,
  type LocalDate,
  type Period,
  type Sen,
} from "@brokely/domain";
import {
  acceptEssentialCard,
  dismissCard,
  findCycleOn,
  getPlan,
  listCategories,
  listDebts,
  listTransactions,
  postponeCard,
  type CategoryRow,
  type Plan,
  type PlanningCycleRow,
} from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { brokely, essentialLines as say, type Line } from "../../src/lib/brokely-lines";
import { essentialMeta } from "../../src/lib/essentials-meta";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, today } from "../../src/lib/today";
import {
  AmountComposer,
  BrokelyBubble,
  ChatScreen,
  MyBubble,
  ReplyButton,
  TypingBubble,
} from "../../src/ui/chat";
import { pickDate } from "../../src/ui/date-picker";
import { space } from "../../src/ui/theme";
import { useConversation } from "../../src/ui/use-conversation";

type Step =
  | "often" // every day / week / month
  | "amount" // how much each time
  | "count" // about how many a month (laundry, top-ups)
  | "bill-or-topup" // phone: a bill on a set day, or top-ups
  | "bill-date"
  | "bill-amount"
  | "confirm"
  | "over" // over budget: "Add it anyway?" (D-28)
  | "done";

const OFTEN: { per: Period; label: string }[] = [
  { per: "day", label: "Every day" },
  { per: "week", label: "Every week" },
  { per: "month", label: "Every month" },
];

/**
 * Adding one essential as a short chat with Brokely (FR-PLN-05/06/07/10/11/20, D-35, D-36).
 * The sum and its working come from the domain, so what Brokely says is what is saved.
 */
export default function EssentialChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const day = useMemo(() => today(), []);
  const context = useRead((db) => {
    const cycle = findCycleOn(db, day);
    const plan = cycle ? getPlan(db, cycle.id) : undefined;
    const category = listCategories(db).find((c) => c.id === id);
    if (!cycle || !plan || !category) return null;
    // What is already spent this cycle, per category, and in this category before tracking
    // started (the catch-up entry), for R-14.
    const transactions = listTransactions(db, {
      start: cycle.startDate,
      endExclusive: cycle.endDateExclusive,
    });
    const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
    const directionOf = (debtId: string) => directions.get(debtId);
    const spentByCategory = spendingByCategory(transactions, directionOf);
    const before = transactions.filter((t) => t.localDate < cycle.trackingStartDate);
    const spentBeforeSen = spendingByCategory(before, directionOf).get(category.id) ?? sen(0);
    return { cycle, plan, category, spentByCategory, spentBeforeSen };
  });
  if (!context) return <Redirect href="/" />;
  return <Chat {...context} day={day} />;
}

interface Context {
  cycle: PlanningCycleRow;
  plan: Plan;
  category: CategoryRow;
  spentByCategory: ReadonlyMap<string, Sen>;
  spentBeforeSen: Sen;
}

function Chat({
  cycle,
  plan,
  category,
  spentByCategory,
  spentBeforeSen,
  day,
}: Context & { day: LocalDate }) {
  const meta = essentialMeta(category.name);
  const range = {
    start: localDate(cycle.startDate),
    endExclusive: localDate(cycle.endDateExclusive),
  };
  const end = inclusiveEnd(range);
  // The plan's tracked days (R-12) and the starting month's length, for "a month" (D-36).
  const planDays = lengthInDays({
    start: localDate(cycle.trackingStartDate),
    endExclusive: range.endExclusive,
  });
  const monthDays = lastDayOfMonth(range.start);
  const budget = sen(plan.revision.budgetSen);

  const chat = useConversation<Step>("waiting");
  const [often, setOften] = useState<Period>(meta.likely);
  const [perMonth, setPerMonth] = useState(0);
  const [billDate, setBillDate] = useState<LocalDate | null>(null);
  const [total, setTotal] = useState<Sen>(sen(0));
  const [bill, setBill] = useState<{ amountSen: Sen; due: LocalDate } | null>(null);

  // With earlier spending the saved total differs from what was typed; Brokely explains it.
  const addLabel = spentBeforeSen > 0 ? "Add to my plan" : `Add ${formatRM(total)} to my plan`;

  const firstQuestion = (): [Line, Step] =>
    meta.style === "daily"
      ? [say.askDaily(), "amount"]
      : meta.style === "often"
        ? [say.askHowOften(category.name), "often"]
        : meta.style === "count"
          ? [say.askCount(meta.unit), "count"]
          : [say.askBillOrTopUp(), "bill-or-topup"];

  useEffect(() => {
    const [question, step] = firstQuestion();
    // D-46: a suggested amount first, never filled in; the student types their own.
    const tip = healthySuggestion(category.name, budget, planDays);
    const daily = meta.style === "daily" || meta.likely === "day";
    const hint = tip
      ? [say.healthyHint(category.name, tip.percent, tip.totalSen, daily ? tip.perDaySen : null)]
      : [];
    chat.say([say.intro(meta.intro), ...hint, question], step);
    // Runs only when the chat first shows.
  }, []);

  /** Brokely shows the working, then asks to add it (or, over budget, "Add it anyway?"). */
  const offer = (working: Line, amount: Sen) => {
    // The card covers the tracked days; spending from before them is added on top (R-14).
    const allocation = essentialAllocation(amount, spentBeforeSen);
    setTotal(allocation);
    const after = [
      ...plan.allocations.filter((a) => a.categoryId !== category.id),
      { categoryId: category.id, amountSen: allocation },
    ];
    // Money already spent counts as spoken for (R-14).
    const left = unplannedSen(budget, after, spentByCategory);
    const lines: Line[] = [working];
    if (spentBeforeSen > 0) lines.push(say.plusBefore(spentBeforeSen, category.name, allocation));
    lines.push(left >= 0 ? say.leaves(left, category.name) : say.over(sen(-left), budget));
    chat.say(lines, left >= 0 ? "confirm" : "over");
  };

  const readAmount = (text: string, again: Step): Sen | null => {
    const amount = parseAmount(text);
    chat.answer(amount === null ? text : formatRM(amount), amount !== null);
    if (amount === null || amount === 0) {
      chat.say([amount === null ? brokely.couldNotRead() : brokely.needMoreThanZero()], again);
      return null;
    }
    return amount;
  };

  const save = (acknowledged: boolean) => {
    chat.answer(acknowledged ? "Add anyway" : addLabel);
    const saved = acceptEssentialCard(repo, {
      cycleId: cycle.id,
      categoryId: category.id,
      allocationSen: total,
      shortfallAcknowledged: acknowledged,
      bill: bill
        ? {
            name: category.name,
            amountSen: bill.amountSen,
            repeat: { kind: "monthly", day: dayOfMonth(bill.due) },
            anchorDate: bill.due,
          }
        : undefined,
    });
    if (!saved.ok)
      return chat.say(
        [[refusalText(saved.code, saved.message)]],
        acknowledged ? "over" : "confirm",
      );
    // A bill due after this plan adds RM0 now; without this the card would keep coming back.
    if (total === 0) dismissCard(repo, cycle.id, category.id);
    chat.say([say.added(category.name, total)], "done");
  };

  const changeAmount = () => {
    chat.answer("Change the amount");
    setBill(null);
    const [question, step] = firstQuestion();
    chat.say([question], step);
  };

  const countReplies = (onPick: (n: number) => void) => (
    <>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={{ flex: 1 }}>
            <ReplyButton title={n === 4 ? "4+" : String(n)} onPress={() => onPick(n)} />
          </View>
        ))}
      </View>
      <ReplyButton
        title="Not sure"
        detail={`I'll log each ${meta.unit} and you suggest later`}
        onPress={() => {
          chat.answer("Not sure");
          // No amount is invented (FR-PLN-13): the card comes back later in this cycle.
          postponeCard(repo, cycle.id, category.id);
          chat.say([say.notSure(meta.unit)], "done");
        }}
      />
    </>
  );

  const footer = (() => {
    switch (chat.step) {
      case "often":
        return [...OFTEN]
          .sort((a, b) => (a.per === meta.likely ? -1 : b.per === meta.likely ? 1 : 0))
          .map((o) => (
            <ReplyButton
              key={o.per}
              title={o.label}
              primary={o.per === meta.likely}
              onPress={() => {
                chat.answer(o.label);
                setOften(o.per);
                chat.say([say.askHowMuch(o.per)], "amount");
              }}
            />
          ));
      case "count":
        return countReplies((n) => {
          chat.answer(n === 4 ? "4+" : `${n} a month`);
          setPerMonth(n);
          chat.say(
            n === 4 ? [say.countedFour(), say.askEach(meta.unit)] : [say.askEach(meta.unit)],
            "amount",
          );
        });
      case "bill-or-topup":
        return (
          <>
            <ReplyButton
              primary
              title="A monthly bill"
              detail="On a set day each month"
              onPress={() => {
                chat.answer("A monthly bill");
                chat.say([say.askBillDate()], "bill-date");
              }}
            />
            <ReplyButton
              title="I top up when it runs out"
              onPress={() => {
                chat.answer("I top up when it runs out");
                chat.say([say.askCount(meta.unit)], "count");
              }}
            />
          </>
        );
      case "bill-date":
        return (
          <ReplyButton
            primary
            title="Pick the due date"
            onPress={async () => {
              const due = await pickDate(day);
              if (!due) return;
              chat.answer(`Due ${dayMonth(due)}`);
              setBillDate(due);
              chat.say([say.askBillAmount()], "bill-amount");
            }}
          />
        );
      case "bill-amount":
        return (
          <AmountComposer
            label="Type the bill amount"
            onSend={(text) => {
              const amount = readAmount(text, "bill-amount");
              if (amount === null || !billDate) return;
              const { count, totalSen } = billSuggestion(
                amount,
                { kind: "monthly", day: dayOfMonth(billDate) },
                billDate,
                range,
              );
              setBill({ amountSen: amount, due: billDate });
              offer(say.workingBill(count, amount, totalSen, end), totalSen);
            }}
          />
        );
      case "amount":
        return (
          <AmountComposer
            label={
              meta.style === "often" || meta.style === "daily"
                ? `Type how much ${often === "day" ? "a day" : often === "week" ? "a week" : "a month"}`
                : `Type how much each ${meta.unit}`
            }
            onSend={(text) => {
              const amount = readAmount(text, "amount");
              if (amount === null) return;
              if (perMonth > 0) {
                const { times, totalSen } = essentialSuggestion(
                  amount,
                  { times: perMonth, per: "month" },
                  planDays,
                  monthDays,
                );
                offer(
                  say.workingCount(perMonth, meta.unit, amount, times, totalSen, end),
                  totalSen,
                );
              } else {
                const { times, totalSen } = essentialSuggestion(
                  amount,
                  { times: 1, per: often },
                  planDays,
                  monthDays,
                );
                offer(say.workingOften(amount, often, times, totalSen, end), totalSen);
              }
            }}
          />
        );
      case "confirm":
        return (
          <>
            <ReplyButton title="Change the amount" onPress={changeAmount} />
            <ReplyButton primary title={addLabel} onPress={() => save(false)} />
          </>
        );
      case "over":
        return (
          <>
            <ReplyButton title="Change the amount" onPress={changeAmount} />
            <ReplyButton primary title="Add anyway" onPress={() => save(true)} />
          </>
        );
      case "done":
        return <ReplyButton primary title="Back to Home" onPress={() => router.back()} />;
      default:
        return null;
    }
  })();

  const lastMine = chat.messages.map((m) => m.from).lastIndexOf("me");
  return (
    <ChatScreen subtitle={`Adding ${category.name}`} onBack={() => router.back()} footer={footer}>
      {chat.messages.map((m, i) =>
        m.from === "me" ? (
          <MyBubble key={m.id} text={m.text} big={m.big} />
        ) : (
          <BrokelyBubble
            key={m.id}
            line={m.line}
            avatar={
              chat.messages[i + 1]?.from !== "brokely" &&
              !(chat.typing && i === chat.messages.length - 1)
            }
            faded={i < lastMine}
          />
        ),
      )}
      {chat.typing ? <TypingBubble /> : null}
    </ChatScreen>
  );
}

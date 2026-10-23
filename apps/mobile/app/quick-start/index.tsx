import {
  budgetAfterPayback,
  checkPayback,
  cycleFromInclusive,
  formatRM,
  healthySuggestion,
  inclusiveEnd,
  lengthInDays,
  midMonthStart,
  offersCatchUp,
  parseAmount,
  sen,
  sumSen,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import { getNickname, listCategories, quickStart, type OpeningDebt } from "@brokely/local-db";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { brokely, type Line } from "../../src/lib/brokely-lines";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, monthName, today } from "../../src/lib/today";
import {
  AmountComposer,
  BrokelyBubble,
  ChatScreen,
  MyBubble,
  ReplyButton,
  TextComposer,
  TypingBubble,
} from "../../src/ui/chat";
import { Button } from "../../src/ui/components";
import { pickDate } from "../../src/ui/date-picker";
import { space } from "../../src/ui/theme";
import { useConversation } from "../../src/ui/use-conversation";

/** The "Mostly on" choices for catching up, in this order (wireframe S1d). */
const MOSTLY_ON = ["Meals", "Snacks & treats", "Home necessities", "Other"];

type Step =
  | "fresh-amount" // S1b: what's left until the month end? (after the 1st: or plan all, D-114)
  | "fresh-confirm"
  | "cu-money" // S1d: the month's money
  | "cu-gone" // S1d: roughly how much is gone
  | "cu-mostly" // S1d: mostly on which category
  | "cu-confirm"
  // D-41: debts from before the plan, asked right after the money
  | "owe-ask"
  | "owe-who"
  | "owe-amount"
  | "owe-payback"
  | "owe-part"
  | "owe-more"
  | "owed-ask"
  | "owed-who"
  | "owed-amount"
  | "owed-more";

/** The biggest parts of a healthy plan for this budget, as a tip only (D-46). */
function healthyParts(budget: Sen, planDays: number) {
  const parts = ["Meals", "Home necessities", "Transport"].flatMap((name) => {
    const s = healthySuggestion(name, budget, planDays);
    return s ? [{ name, percent: s.percent, sen: s.totalSen }] : [];
  });
  const emergency = healthySuggestion("Emergency", budget, planDays);
  const savings = healthySuggestion("Savings", budget, planDays);
  if (emergency && savings) {
    parts.push({
      name: "Set aside",
      percent: emergency.percent + savings.percent,
      sen: sen(emergency.totalSen + savings.totalSen),
    });
  }
  return parts;
}

/** The debt being asked about (D-41). */
interface DebtDraft {
  readonly name: string;
  readonly amountSen: Sen;
}

/**
 * Quick start as a chat with Brokely (D-33): S1c, S1b and S1d in one conversation.
 * FR-PLN-19 (budget and dates only, approved here), FR-PLN-01 (never a balance), FR-PLN-02
 * (any dates), FR-PLN-08 (a plain line, no totals box), FR-PLN-21 + R-12 (catch up: whole
 * month, one "Spent before Brokely" entry, days count from today). AC-53, AC-58, AC-59.
 * D-41: after the money, Brokely asks about debts from before; what the student pays back
 * during the plan comes off the budget, and every debt is saved in Debts.
 */
export default function QuickStartChat() {
  const day = useMemo(() => today(), []);
  const nickname = useRead(getNickname);
  const catchUpOffered = offersCatchUp(day);
  const freshRange = midMonthStart(day, "fresh").range;
  const month = midMonthStart(day, "catch_up").range;

  const mostlyOn = useRead((db) => {
    const all = listCategories(db);
    return MOSTLY_ON.flatMap((name) => all.filter((c) => c.name === name));
  });

  const chat = useConversation<Step>("waiting");
  const [start, setStart] = useState(freshRange.start);
  const [end, setEnd] = useState(inclusiveEnd(freshRange));
  const [mode, setMode] = useState<"fresh" | "catch_up">("fresh");
  /** The money the student typed, before any payback (D-41). */
  const [money, setMoney] = useState<Sen>(sen(0));
  const [budget, setBudget] = useState<Sen>(sen(0));
  const [debts, setDebts] = useState<readonly OpeningDebt[]>([]);
  const [draft, setDraft] = useState<DebtDraft>({ name: "", amountSen: sen(0) });
  const [gone, setGone] = useState<Sen>(sen(0));
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const days = (from: LocalDate, to: LocalDate) => lengthInDays(cycleFromInclusive(from, to));

  // Brokely opens the conversation once.
  useEffect(() => {
    if (catchUpOffered) {
      chat.say([brokely.greeting(nickname), brokely.askLeftThisMonth(day)], "fresh-amount");
    } else {
      chat.say([brokely.greeting(nickname), brokely.freshMonth(day, end)], "fresh-amount");
    }
    // Runs only when the chat first shows; later changes must not restart the conversation.
  }, []);

  /** Reads a typed amount; on a problem Brokely explains and asks again. */
  const readAmount = (text: string, step: Step, allowZero: boolean): Sen | null => {
    const amount = parseAmount(text);
    chat.answer(amount === null ? text : formatRM(amount), amount !== null);
    if (amount === null) {
      chat.say([brokely.couldNotRead()], step);
      return null;
    }
    if (amount === 0 && !allowZero) {
      chat.say([brokely.needMoreThanZero()], step);
      return null;
    }
    return amount;
  };

  const confirmFresh = (amount: Sen, from: LocalDate, to: LocalDate) =>
    chat.say(
      [brokely.perDay(amount, days(from, to)), brokely.confirmDates(from, to)],
      "fresh-confirm",
    );

  const summariseCatchUp = (spent: Sen) =>
    chat.say(
      [
        brokely.catchUpSummary(budget, spent, day),
        brokely.healthyPlan(budget, healthyParts(budget, days(month.start, inclusiveEnd(month)))),
        brokely.askSetUp(),
      ],
      "cu-confirm",
    );

  const plannedPayback = (list: readonly OpeningDebt[]) =>
    sumSen(list.map((d) => d.paybackSen ?? sen(0)));

  /** After the money: ask about debts from before (D-41). */
  const askDebts = (amount: Sen, chosen: "fresh" | "catch_up") => {
    setMode(chosen);
    setMoney(amount);
    setDebts([]);
    chat.say([brokely.askOwe()], "owe-ask");
  };

  /** Saves a debt the student owes, with what they pay back in this plan, then asks for more. */
  const addOwed = (paybackSen: Sen | undefined, lines: Line[]) => {
    setDebts((list) => [
      ...list,
      { direction: "owed_by_me", counterparty: draft.name, amountSen: draft.amountSen, paybackSen },
    ]);
    chat.say([...lines, brokely.askOweMore()], "owe-more");
  };

  /** Checks a payback (D-41); on a problem Brokely explains and asks for an amount. */
  const tryPayback = (payback: Sen) => {
    const planned = plannedPayback(debts);
    const check = checkPayback(money, planned, draft.amountSen, payback);
    if (check.ok) return addOwed(payback, [brokely.paybackNoted(payback, draft.name)]);
    chat.say(
      [
        check.code === "DEBT_EXCEEDS_OUTSTANDING"
          ? brokely.paybackMoreThanOwed(draft.amountSen, draft.name)
          : brokely.paybackLeavesNothing(sen(money - planned)),
      ],
      "owe-part",
    );
  };

  /** Debts done: the budget is the money minus the paybacks, then the usual questions. */
  const finishDebts = () => {
    const payback = plannedPayback(debts);
    const planBudget = budgetAfterPayback(
      money,
      debts.map((d) => d.paybackSen ?? sen(0)),
    );
    setBudget(planBudget);
    const summary: Line[] = payback > 0 ? [brokely.paybackSummary(money, payback, planBudget)] : [];
    if (mode === "fresh") {
      chat.say(
        [
          ...summary,
          brokely.perDay(planBudget, days(start, end)),
          brokely.healthyPlan(planBudget, healthyParts(planBudget, days(start, end))),
          brokely.confirmDates(start, end),
        ],
        "fresh-confirm",
      );
    } else {
      chat.say([...summary, brokely.askAlreadyGone()], "cu-gone");
    }
  };

  const changeDates = async () => {
    chat.answer("Change dates");
    const from = await pickDate(start);
    if (!from) return chat.say([brokely.confirmDates(start, end)], "fresh-confirm");
    const to = await pickDate(end < from ? from : end);
    if (!to) return chat.say([brokely.confirmDates(start, end)], "fresh-confirm");
    if (to < from) return chat.say([brokely.endBeforeStart()], "fresh-confirm");
    setStart(from);
    setEnd(to);
    confirmFresh(budget, from, to);
  };

  const startPlan = () => {
    chat.answer("Yes, start my plan");
    const fresh = chat.step === "fresh-confirm";
    const saved = quickStart(
      repo,
      fresh
        ? { budgetSen: budget, startDate: start, endDateInclusive: end, openingDebts: debts }
        : {
            openingDebts: debts,
            budgetSen: budget,
            startDate: month.start,
            endDateInclusive: inclusiveEnd(month),
            trackingStartDate: day, // days count from today (R-12)
            openingSpend: gone > 0 && categoryId ? { amountSen: gone, categoryId } : undefined,
          },
    );
    if (!saved.ok) {
      const reply: Line = [refusalText(saved.code, saved.message)];
      return chat.say([reply], fresh ? "fresh-confirm" : "cu-confirm");
    }
    router.replace("/quick-start/done");
  };

  const footer = (() => {
    switch (chat.step) {
      case "fresh-amount":
        return (
          <>
            <AmountComposer
              label="Type what you have left"
              onSend={(text) => {
                const amount = readAmount(text, "fresh-amount", false);
                if (amount === null) return;
                askDebts(amount, "fresh");
              }}
            />
            {/* After the 1st, the whole month is the smaller choice (D-114, was "catch me up"). */}
            {catchUpOffered ? (
              <Button
                variant="link"
                label={`I'd rather plan all of ${monthName(day)}`}
                onPress={() => {
                  chat.answer(`I'd rather plan all of ${monthName(day)}`);
                  chat.say([brokely.askMonthMoney(day)], "cu-money");
                }}
              />
            ) : null}
          </>
        );
      case "fresh-confirm":
        return (
          <>
            <ReplyButton title="Change dates" onPress={() => void changeDates()} />
            <ReplyButton primary title="Yes, start my plan" onPress={startPlan} />
          </>
        );
      case "cu-money":
        return (
          <AmountComposer
            label={`Type the money for all of ${monthName(day)}`}
            onSend={(text) => {
              const amount = readAmount(text, "cu-money", false);
              if (amount === null) return;
              askDebts(amount, "catch_up");
            }}
          />
        );
      case "cu-gone":
        return (
          <>
            <ReplyButton
              title="Nothing yet"
              onPress={() => {
                chat.answer("Nothing yet");
                setGone(sen(0));
                summariseCatchUp(sen(0));
              }}
            />
            <AmountComposer
              label="Or type roughly how much is used"
              onSend={(text) => {
                const amount = readAmount(text, "cu-gone", true);
                if (amount === null) return;
                setGone(amount);
                if (amount === 0) summariseCatchUp(amount);
                else chat.say([brokely.askMostlyOn()], "cu-mostly");
              }}
            />
          </>
        );
      case "cu-mostly":
        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {mostlyOn.map((c) => (
              <View key={c.id} style={{ width: "48%" }}>
                <ReplyButton
                  title={c.name}
                  onPress={() => {
                    chat.answer(c.name);
                    setCategoryId(c.id);
                    summariseCatchUp(gone);
                  }}
                />
              </View>
            ))}
          </View>
        );
      case "cu-confirm":
        return <ReplyButton primary title="Yes, start my plan" onPress={startPlan} />;
      case "owe-ask":
      case "owed-ask":
      case "owe-more":
      case "owed-more": {
        // Yes / No: anyone (else) the student owes, or who owes them (D-41).
        const first = chat.step === "owe-ask" || chat.step === "owed-ask";
        const owe = chat.step === "owe-ask" || chat.step === "owe-more";
        const no = first ? "No" : "No, that's all";
        const yes = !first
          ? "Yes, someone else"
          : owe
            ? "Yes, I owe someone"
            : "Yes, someone owes me";
        return (
          <>
            <ReplyButton
              title={no}
              onPress={() => {
                chat.answer(no);
                if (owe) chat.say([brokely.askOwedToYou()], "owed-ask");
                else finishDebts();
              }}
            />
            <ReplyButton
              title={yes}
              onPress={() => {
                chat.answer(yes);
                if (owe) chat.say([brokely.askOweWho()], "owe-who");
                else chat.say([brokely.askOwedWho()], "owed-who");
              }}
            />
          </>
        );
      }
      case "owe-who":
      case "owed-who": {
        const owe = chat.step === "owe-who";
        return (
          <TextComposer
            label="Type their name (up to 2 words)"
            placeholder="e.g. Aiman or Kak Sarah"
            name
            onSend={(text) => {
              const name = text.trim();
              if (name === "") return;
              chat.answer(name);
              setDraft({ name, amountSen: sen(0) });
              if (owe) chat.say([brokely.askOweHowMuch(name)], "owe-amount");
              else chat.say([brokely.askOwedHowMuch(name)], "owed-amount");
            }}
          />
        );
      }
      case "owe-amount":
        return (
          <AmountComposer
            label="Type how much you owe"
            onSend={(text) => {
              const amount = readAmount(text, "owe-amount", false);
              if (amount === null) return;
              setDraft({ name: draft.name, amountSen: amount });
              chat.say([brokely.askPayBack(end)], "owe-payback");
            }}
          />
        );
      case "owe-payback":
        return (
          <>
            <ReplyButton
              primary
              title={`All of it (${formatRM(draft.amountSen)})`}
              onPress={() => {
                chat.answer("All of it");
                tryPayback(draft.amountSen);
              }}
            />
            <ReplyButton
              title="Part of it"
              onPress={() => {
                chat.answer("Part of it");
                chat.say([brokely.askPayBackHowMuch(end)], "owe-part");
              }}
            />
            <ReplyButton
              title="Not this month"
              onPress={() => {
                chat.answer("Not this month");
                addOwed(undefined, [brokely.paybackLater(draft.name)]);
              }}
            />
          </>
        );
      case "owe-part":
        return (
          <AmountComposer
            label="Type how much you'll pay back"
            onSend={(text) => {
              const amount = readAmount(text, "owe-part", false);
              if (amount === null) return;
              tryPayback(amount);
            }}
          />
        );
      case "owed-amount":
        return (
          <AmountComposer
            label="Type how much they owe you"
            onSend={(text) => {
              const amount = readAmount(text, "owed-amount", false);
              if (amount === null) return;
              setDebts((list) => [
                ...list,
                { direction: "owed_to_me", counterparty: draft.name, amountSen: amount },
              ]);
              chat.say([brokely.owedNoted(draft.name), brokely.askOwedMore()], "owed-more");
            }}
          />
        );
      default:
        return null; // Brokely is typing
    }
  })();

  // Brokely's older messages fade once the student has answered after them.
  const lastMine = chat.messages.map((m) => m.from).lastIndexOf("me");

  return (
    <ChatScreen
      subtitle="Planning with you"
      onBack={() => router.replace("/")}
      // Planning is never required (FR-PLN-04, FR-PLN-19): Home offers "Make a plan" later.
      onSkip={() => router.replace("/")}
      footer={footer}
    >
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

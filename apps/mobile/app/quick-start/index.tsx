import {
  cycleFromInclusive,
  formatRM,
  inclusiveEnd,
  lengthInDays,
  midMonthStart,
  offersCatchUp,
  parseAmount,
  sen,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import { getNickname, listCategories, quickStart } from "@brokely/local-db";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { brokely, type Line } from "../../src/lib/brokely-lines";
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

/** The "Mostly on" choices for catching up, in this order (wireframe S1d). */
const MOSTLY_ON = ["Meals", "Snacks & treats", "Groceries & toiletries", "Other"];

type Step =
  | "choose" // S1c: already spent some?
  | "fresh-amount" // S1b: what's left until the month end?
  | "fresh-confirm"
  | "cu-money" // S1d: the month's money
  | "cu-gone" // S1d: roughly how much is gone
  | "cu-mostly" // S1d: mostly on which category
  | "cu-confirm";

/**
 * Quick start as a chat with Brokely (D-33): S1c, S1b and S1d in one conversation.
 * FR-PLN-19 (budget and dates only, approved here), FR-PLN-01 (never a balance), FR-PLN-02
 * (any dates), FR-PLN-08 (a plain line, no totals box), FR-PLN-21 + R-12 (catch up: whole
 * month, one "Spent before Brokely" entry, days count from today). AC-53, AC-58, AC-59.
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
  const [budget, setBudget] = useState<Sen>(sen(0));
  const [gone, setGone] = useState<Sen>(sen(0));
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const days = (from: LocalDate, to: LocalDate) => lengthInDays(cycleFromInclusive(from, to));

  // Brokely opens the conversation once.
  useEffect(() => {
    if (catchUpOffered) {
      chat.say([brokely.greeting(nickname), brokely.askAlreadySpent(day)], "choose");
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
    chat.say([brokely.catchUpSummary(budget, spent, day), brokely.askSetUp()], "cu-confirm");

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
        ? { budgetSen: budget, startDate: start, endDateInclusive: end }
        : {
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
      case "choose":
        return (
          <>
            <ReplyButton
              primary
              title="No, start fresh from today"
              detail={`I'll tell you what's left until ${dayMonth(inclusiveEnd(freshRange))}`}
              onPress={() => {
                chat.answer("No, start fresh from today");
                chat.say([brokely.askLeft(end)], "fresh-amount");
              }}
            />
            <ReplyButton
              title="Yes, catch me up"
              detail="Plan the whole month, add roughly what's gone"
              onPress={() => {
                chat.answer("Yes, catch me up");
                chat.say([brokely.askMonthMoney(day)], "cu-money");
              }}
            />
          </>
        );
      case "fresh-amount":
        return (
          <AmountComposer
            label="Type what you have left"
            onSend={(text) => {
              const amount = readAmount(text, "fresh-amount", false);
              if (amount === null) return;
              setBudget(amount);
              confirmFresh(amount, start, end);
            }}
          />
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
            label="Type the month's money"
            onSend={(text) => {
              const amount = readAmount(text, "cu-money", false);
              if (amount === null) return;
              setBudget(amount);
              chat.say([brokely.askAlreadyGone()], "cu-gone");
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
              label="Or type roughly how much"
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
      default:
        return null; // Brokely is typing
    }
  })();

  // Brokely's older messages fade once the student has answered after them.
  const lastMine = chat.messages.map((m) => m.from).lastIndexOf("me");

  return (
    <ChatScreen
      subtitle={
        !catchUpOffered
          ? "Planning with you"
          : chat.step === "choose" || chat.messages.length < 3
            ? "Planning with you · step 1 of 2"
            : "Planning with you · step 2 of 2"
      }
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

import {
  formatRM,
  guessCategory,
  noteSuggestions,
  parseAmount,
  sen,
  type LocalDate,
} from "@brokely/domain";
import {
  addCategory,
  createDebt,
  deleteDebt,
  deleteTransaction,
  recordMoneyIn,
  recordPurchase,
  recordSplitPurchase,
  recordTransaction,
  type RepoResult,
} from "@brokely/local-db";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { categoriesByUse, guessHistory } from "../src/lib/category-order";
import { categoryIcon } from "../src/lib/essentials-meta";
import { readDebts } from "../src/lib/debts-model";
import { refusalText } from "../src/lib/messages";
import { dayMonth, occurredAtFor, today } from "../src/lib/today";
import { Button, Sticker } from "../src/ui/components";
import { pickDate } from "../src/ui/date-picker";
import { Keypad } from "../src/ui/keypad";
import { SheetPanel, SheetScroll, WhenFull } from "../src/ui/sheet";
import { DebtExtras, MoneyInExtras, SpentExtras } from "../src/ui/sheet-extras";
import { asTyped } from "../src/ui/allocation-fields";
import { CategoryPicker } from "../src/ui/category-picker";
import { Icon, type IconName } from "../src/ui/icon";
import { PayBackBy } from "../src/ui/pay-back-by";
import { Chip, Field } from "../src/ui/sheet-parts";
import { fonts, MIN_TOUCH, radius, space, type } from "../src/ui/theme";
import { KeyboardSafe } from "../src/ui/keyboard-safe";
import { useTheme } from "../src/ui/theme-context";
import { useMoneyTip } from "../src/ui/money-tip";
import { savedBuzz } from "../src/ui/haptics";
import { useUndo } from "../src/ui/undo";
import { useKeyboardOpen } from "../src/ui/use-keyboard";

type Mode = "spent" | "in" | "more";
type MoreKind = "transfer" | "lent" | "borrowed";

/** What the note box asks, per tab (D-49). */
const NOTE_PROMPT: Record<Mode, string> = {
  spent: "What was it? e.g. nasi lemak",
  in: "What's it for? e.g. October money",
  more: "Add a note, e.g. for the trip",
};

const FRIEND = "From a friend";
/** Shortcut to More → I borrowed: saved as a debt, not money in. */
const BORROWED = "Borrowed (debt)";
/** Meal money first: it is the default and the most common money in (D-55). */
const FROM = ["Meal money", "From family", FRIEND, "Part-time", "Gift", BORROWED, "Other"];
/** An icon per money-in source, shown in the From list (D-108). */
const FROM_ICON: Record<string, IconName> = {
  "From family": "users-three",
  "Meal money": "fork-knife",
  [FRIEND]: "user",
  "Part-time": "briefcase",
  Gift: "gift",
  [BORROWED]: "hand-coins",
  Other: "coins",
};

/** The More choices, each saying what it does (D-85). */
const MORE: { kind: MoreKind; icon: IconName; label: string; detail: string }[] = [
  {
    kind: "transfer",
    icon: "arrows-left-right",
    label: "Between my own wallets",
    detail: "e.g. bank to TNG · never spending",
  },
  {
    kind: "lent",
    icon: "arrow-up-right",
    label: "I lent money",
    detail: "Someone owes you · shows in Debts",
  },
  {
    kind: "borrowed",
    icon: "arrow-down-left",
    label: "I borrowed money",
    detail: "You owe someone · shows in Debts",
  },
];

/**
 * S4 / S4c Quick add (FR-TXN-01/02/03/10/11, FR-DEBT-01/05, D-01, D-24, D-26, D-28, D-38):
 * a fast plain form. Type the amount, tap a category, Save; then Undo for 5 seconds.
 * Refunds are made from a purchase in Records, because they must link to it (FR-TXN-06).
 */
export default function QuickAdd() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const offerTip = useMoneyTip();
  const day = useMemo(() => today(), []);
  const keyboardOpen = useKeyboardOpen();
  const categories = useRead((db) => categoriesByUse(db, day), [day]);
  const history = useRead((db) => guessHistory(db, day), [day]);

  // Debts opens it on More → I lent / I borrowed (S7 "+ Add").
  const params = useLocalSearchParams<{ more?: MoreKind }>();
  const [mode, setMode] = useState<Mode>(params.more ? "more" : "spent");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState<LocalDate>(day);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Spent
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** A category chosen by hand is never replaced by a guess (D-84). */
  const [pickedByHand, setPickedByHand] = useState(false);
  const [split, setSplit] = useState(false);
  /** Under Other: the student's own category name (D-44). */
  const [customName, setCustomName] = useState("");
  const [friend, setFriend] = useState("");
  const [shareText, setShareText] = useState("");
  // Money in / More
  const [from, setFrom] = useState(FROM[0]!);
  const [moreKind, setMoreKind] = useState<MoreKind>(params.more ?? "transfer");
  const [person, setPerson] = useState("");
  const [payBackBy, setPayBackBy] = useState<LocalDate | null>(null);

  const amount = parseAmount(amountText);
  const share = parseAmount(shareText);
  // Smart categorization (D-84): the note suggests a category until one is picked by hand.
  const guess = useMemo(
    () => (mode === "spent" && !pickedByHand ? guessCategory(note, history, categories) : null),
    [mode, pickedByHand, note, history, categories],
  );
  const picked =
    categories.find((c) => c.id === (guess?.categoryId ?? categoryId)) ?? categories[0];
  const guessed = guess !== null && picked?.id === guess.categoryId;
  const when = { localDate: date, occurredAt: occurredAtFor(date, day) };
  const cleanNote = note.trim();
  // One-tap notes typed recently for this category, e.g. "nasi lemak".
  // Past notes that match what is being typed (D-112); nothing while empty or unmatched.
  const noteIdeas = mode === "spent" ? noteSuggestions(history, note) : [];

  /** Saves, then closes the sheet and offers Undo (D-38). */
  const finish = <T,>(
    result: RepoResult<T>,
    message: string,
    undo: (value: T) => void,
    /** For spending: the category, so a money tip can relate to it (D-67). */
    tipFor?: string,
  ) => {
    if (!result.ok) return setProblem(refusalText(result.code, result.message));
    savedBuzz();
    router.back();
    showUndo(message, () => undo(result.value));
    if (tipFor !== undefined) offerTip(tipFor);
  };

  const save = () => {
    if (amount === null || amount <= 0) return setProblem("Type an amount above zero first.");
    if (mode === "spent") {
      if (!picked) return;
      // A name typed under Other becomes a category of its own, kept for next time (D-44).
      const typed = customName.trim();
      if (picked.name === "Other" && typed) {
        const existing = categories.find((c) => c.name.toLowerCase() === typed.toLowerCase());
        if (existing) {
          setCategoryId(existing.id);
          setCustomName("");
          return saveIn(existing);
        }
        const added = addCategory(repo, { name: typed, kind: "optional" });
        if (!added.ok) return setProblem(refusalText(added.code, added.message));
        return saveIn({ id: added.value.id, name: typed });
      }
      return saveIn(picked);
    }
    return saveOther();
  };

  const saveIn = (picked: { id: string; name: string }) => {
    if (amount === null) return;
    const label = picked.name;
    if (split) {
      if (!friend.trim() || share === null || share <= 0) {
        return setProblem("Add your friend's name and their share.");
      }
      if (share >= amount) return setProblem("Your friend's share must be less than the total.");
      return finish(
        recordSplitPurchase(repo, {
          amountSen: amount,
          categoryId: picked.id,
          friends: [{ counterparty: friend.trim(), amountSen: share }],
          note: cleanNote,
          ...when,
        }),
        `Saved ${formatRM(amount)} · ${label} · ${friend.trim()} owes ${formatRM(share)}`,
        ({ transactionId, debtIds }) => {
          deleteTransaction(repo, transactionId);
          debtIds.forEach((id) => deleteDebt(repo, id));
        },
        picked.name,
      );
    }
    return finish(
      recordPurchase(repo, {
        amountSen: amount,
        categoryId: picked.id,
        note: cleanNote,
        ...when,
      }),
      `Saved ${formatRM(amount)} · ${label}`,
      ({ id }) => deleteTransaction(repo, id),
      picked.name,
    );
  };

  const saveOther = () => {
    if (amount === null) return;
    if (mode === "in" && from === BORROWED) {
      // A shortcut to More → I borrowed: money received that must be paid back is a debt,
      // never money in or spending (FR-DEBT-06).
      return saveDebt(false);
    }
    if (mode === "in") {
      // "From a friend · Ali · birthday": the source, the friend's name if given, the note.
      const source = [from, from === FRIEND ? person.trim() : "", cleanNote]
        .filter(Boolean)
        .join(" · ");
      return finish(
        recordMoneyIn(repo, { amountSen: amount, note: source, ...when }),
        `Saved money in ${formatRM(amount)} · ${source}`,
        ({ id }) => deleteTransaction(repo, id),
      );
    }
    if (moreKind === "transfer") {
      return finish(
        recordTransaction(repo, {
          type: "transfer",
          amountSen: amount,
          note: cleanNote,
          lines: [],
          ...when,
        }),
        `Saved transfer ${formatRM(amount)}`,
        ({ id }) => deleteTransaction(repo, id),
      );
    }
    return saveDebt(moreKind === "lent");
  };

  /** I lent (owed to me) or I borrowed (I owe), with the debt it opens (FR-DEBT-01). */
  const saveDebt = (lent: boolean) => {
    if (amount === null || amount <= 0) return;
    if (!person.trim()) {
      return setProblem(lent ? "Add who you lent to." : "Add who you borrowed from.");
    }
    return finish(
      createDebt(repo, {
        direction: lent ? "owed_to_me" : "owed_by_me",
        counterparty: person.trim(),
        amountSen: amount,
        dueDate: payBackBy,
        notes: cleanNote,
        ...when,
      }),
      lent
        ? `${person.trim()} owes you ${formatRM(amount)}`
        : `You owe ${person.trim()} ${formatRM(amount)}`,
      ({ transactionId, debtId }) => {
        deleteTransaction(repo, transactionId);
        deleteDebt(repo, debtId);
      },
    );
  };

  const saveLabel =
    amount === null || amount <= 0
      ? "Save"
      : mode === "spent"
        ? `Save ${formatRM(amount)} · ${picked?.name ?? ""}`
        : mode === "in" && from === BORROWED
          ? `Save borrowed · ${formatRM(amount)}`
          : mode === "in"
            ? `Save money in · ${formatRM(amount)}`
            : // More: the button says what will happen (D-85).
              moreKind === "transfer"
              ? `Save transfer · ${formatRM(amount)}`
              : !person.trim()
                ? `Save ${formatRM(amount)}`
                : moreKind === "lent"
                  ? `Save · ${person.trim()} owes you ${formatRM(amount)}`
                  : `Save · You owe ${person.trim()} ${formatRM(amount)}`;

  return (
    <KeyboardSafe style={{ justifyContent: "flex-end" }}>
      {/* Tapping the dimmed Home closes the sheet. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close quick add"
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(5,6,5,0.55)",
        }}
      />
      <SheetPanel
        top={
          <>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setProblem(null);
              }}
            />

            <Text
              accessibilityLabel={`Amount ${formatRM(amount ?? sen(0))}`}
              style={{
                textAlign: "center",
                fontFamily: fonts.heading,
                fontSize: 48,
                lineHeight: 54,
                color:
                  mode === "spent" ? colors.expense : mode === "in" ? colors.income : colors.text,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatRM(amount ?? sen(0))}
            </Text>
          </>
        }
      >
        <SheetScroll>
          {/* The note comes first, so saying what it was is the obvious next step (D-49). */}
          <View style={{ gap: space.xs }}>
            <Field
              value={note}
              onChange={setNote}
              expanded
              placeholder={NOTE_PROMPT[mode]}
              label={`Note, optional. ${NOTE_PROMPT[mode]}`}
            />
            {/* As you type: up to 3 past notes; a tap fills the note and its category (D-112) */}
            {noteIdeas.length > 0 ? (
              <View
                style={{
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderColor: colors.outline,
                  backgroundColor: colors.card,
                  overflow: "hidden",
                }}
              >
                {noteIdeas.map((idea, i) => {
                  const category = categories.find((c) => c.id === idea.categoryId);
                  return (
                    <Pressable
                      key={idea.note}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${idea.note}${category ? `, ${category.name}` : ""}`}
                      onPress={() => {
                        setNote(idea.note);
                        if (category) {
                          setCategoryId(category.id);
                          setPickedByHand(true);
                        }
                      }}
                      style={({ pressed }) => ({
                        minHeight: MIN_TOUCH,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        paddingHorizontal: space.md,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colors.background,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      {category ? <Icon name={categoryIcon(category.name)} size={20} /> : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontFamily: fonts.bold,
                          fontSize: 15,
                          color: colors.text,
                        }}
                      >
                        {idea.note}
                      </Text>
                      {category ? (
                        <Text style={[type.small, { color: colors.muted }]}>{category.name}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {mode === "spent" ? (
            // One Category row; the list opens on tap and closes after a choice (D-51).
            // It holds every category, the student's own ones too (D-44).
            <CategoryPicker
              categories={categories}
              selectedId={picked?.id ?? null}
              onSelect={(id) => {
                setCategoryId(id);
                setPickedByHand(true);
                setCustomName("");
              }}
              footer={() => <PayingBack amountText={amountText} />}
            />
          ) : null}
          {mode === "spent" && guessed ? (
            <Text accessibilityLiveRegion="polite" style={[type.small, { color: colors.muted }]}>
              Guessed from “{guess?.matched}” · tap Category to change
            </Text>
          ) : null}
          {mode === "spent" && picked?.name === "Other" ? (
            <Field
              value={customName}
              onChange={setCustomName}
              expanded
              placeholder="Name it (optional), e.g. Haircut"
              label="Name your own category, optional"
            />
          ) : null}
          {mode === "in" ? (
            <View>
              {/* Same tidy row as Category: tap to open the sources, pick one (D-55). */}
              <CategoryPicker
                title="From"
                categories={FROM.map((f) => ({ id: f, name: f }))}
                selectedId={from}
                onSelect={setFrom}
                iconOf={(name) => FROM_ICON[name] ?? "coins"}
              />
              {from === FRIEND ? (
                <View style={{ gap: space.xs, marginTop: space.sm }}>
                  <Field
                    value={person}
                    onChange={setPerson}
                    expanded
                    placeholder="Friend's name (optional)"
                  />
                  <Text style={[type.small, { color: colors.muted }]}>
                    Need to pay it back? Pick {BORROWED}.
                  </Text>
                </View>
              ) : null}
              {from === BORROWED ? (
                <View style={{ gap: space.xs, marginTop: space.sm }}>
                  <Field
                    value={person}
                    onChange={setPerson}
                    expanded
                    placeholder="Who did you borrow from?"
                  />
                  <Text style={[type.small, { color: colors.muted }]}>
                    Saved as a debt you'll pay back: not money in and not spending. It shows in
                    Debts.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : mode === "more" ? (
            <View style={{ gap: space.sm }}>
              <Sticker offset={2} rounded={14} style={{ padding: 0, overflow: "hidden" }}>
                <View accessibilityRole="radiogroup">
                  {MORE.map((m, i) => {
                    const on = m.kind === moreKind;
                    return (
                      <Pressable
                        key={m.kind}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${m.label}. ${m.detail}`}
                        onPress={() => {
                          setMoreKind(m.kind);
                          setProblem(null);
                        }}
                        style={({ pressed }) => ({
                          minHeight: MIN_TOUCH + 8,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: space.sm,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          backgroundColor: on ? colors.cardTint : colors.card,
                          borderTopWidth: i === 0 ? 0 : 2,
                          borderTopColor: colors.background,
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Icon name={m.icon} size={24} />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}
                          >
                            {m.label}
                          </Text>
                          <Text style={[type.small, { color: colors.muted }]}>{m.detail}</Text>
                        </View>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: on ? 7 : 2,
                            borderColor: on ? colors.primary : colors.outline,
                            backgroundColor: colors.card,
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </Sticker>
              {moreKind !== "transfer" ? (
                <Field
                  value={person}
                  onChange={setPerson}
                  expanded
                  placeholder={
                    moreKind === "lent" ? "Who did you lend to?" : "Who did you borrow from?"
                  }
                />
              ) : null}
              {/* When it should be paid back; optional, used by the reminder (D-103) */}
              {moreKind !== "transfer" ? (
                <PayBackBy today={day} value={payBackBy} onChange={setPayBackBy} />
              ) : null}
            </View>
          ) : null}

          {/* Date and "Split" share one row; the friend's details open below (D-53). */}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Date: ${date === day ? "today" : dayMonth(date)}. Change`}
              onPress={async () => {
                const chosen = await pickDate(date);
                if (chosen) setDate(chosen);
              }}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH,
                justifyContent: "center",
                paddingHorizontal: space.sm,
                borderRadius: radius.button,
                borderWidth: 2,
                borderColor: colors.outline,
                backgroundColor: colors.card,
              }}
            >
              <Text style={[type.strong, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
                {date === day ? `Today, ${dayMonth(day)}` : dayMonth(date)}
              </Text>
            </Pressable>
            {mode === "spent" ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: split }}
                accessibilityLabel="Split with a friend"
                onPress={() => setSplit((on) => !on)}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingLeft: space.sm,
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderColor: split ? colors.primary : colors.outline,
                  backgroundColor: split ? colors.cardTint : colors.card,
                }}
              >
                <Text style={[type.strong, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
                  Split
                </Text>
                <Switch
                  value={split}
                  onValueChange={setSplit}
                  importantForAccessibility="no"
                  trackColor={{ true: colors.primary, false: colors.outline }}
                />
              </Pressable>
            ) : null}
          </View>

          {mode === "spent" && split ? (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 3 }}>
                  <Field value={friend} onChange={setFriend} placeholder="Friend's name" expanded />
                </View>
                <View style={{ flex: 2 }}>
                  <Field
                    value={shareText}
                    onChange={setShareText}
                    placeholder="Their share"
                    numeric
                  />
                </View>
              </View>
              {amount !== null && share !== null && share > 0 && share < amount ? (
                <Text style={[type.small, { color: colors.muted }]}>
                  Your share {formatRM(sen(amount - share))} counts as spending;{" "}
                  {friend.trim() || "your friend"} owes you {formatRM(share)}.
                </Text>
              ) : null}
            </View>
          ) : null}
          {/* Pulled up to full screen: help finishing this entry (D-87). */}
          <WhenFull>
            {mode === "spent" ? (
              <SpentExtras
                day={day}
                category={picked ?? null}
                typedSen={amount}
                categoryName={(id) => categories.find((c) => c.id === id)?.name ?? "Other"}
                onRepeat={(p) => {
                  setAmountText(asTyped(p.amountSen));
                  setCategoryId(p.categoryId);
                  setPickedByHand(true);
                  setNote(p.note);
                  setSplit(false);
                  setProblem(null);
                }}
              />
            ) : mode === "in" ? (
              <MoneyInExtras
                day={day}
                onRepeat={(r) => {
                  setAmountText(asTyped(r.amountSen));
                  setProblem(null);
                  // Saved as "From family · note" or "From a friend · Ali · note".
                  const [source = "", ...rest] = r.note.split(" · ");
                  if (!FROM.includes(source)) return setNote(r.note);
                  setFrom(source);
                  if (source === FRIEND && rest.length > 1) {
                    setPerson(rest[0]!);
                    setNote(rest.slice(1).join(" · "));
                  } else setNote(rest.join(" · "));
                }}
              />
            ) : (
              <DebtExtras />
            )}
          </WhenFull>
        </SheetScroll>

        {/* Hidden while typing a note or name, so that field stays visible. */}
        {keyboardOpen ? null : (
          <Keypad
            value={amountText}
            onChange={(next) => {
              setAmountText(next);
              setProblem(null);
            }}
          />
        )}
        {problem ? (
          <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
            {problem}
          </Text>
        ) : null}
        <Button label={saveLabel} onPress={save} disabled={amount === null || amount <= 0} />
      </SheetPanel>
    </KeyboardSafe>
  );
}

function Segmented({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const { colors } = useTheme();
  const options: { mode: Mode; label: string }[] = [
    { mode: "spent", label: "Spent" },
    { mode: "in", label: "Money in" },
    { mode: "more", label: "More" },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderWidth: 2,
        borderColor: colors.outline,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: colors.card,
      }}
    >
      {options.map((o, i) => {
        const on = o.mode === value;
        return (
          <Pressable
            key={o.mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.mode)}
            style={{
              flex: 1,
              minHeight: 46,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.primary : undefined,
              borderLeftWidth: i === 0 ? 0 : 2,
              borderColor: colors.outline,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.heavy,
                fontSize: 16,
                color: on ? colors.onPrimary : colors.text,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "Paying someone back?" under the category list (D-104). Paying back is never spending
 * (FR-DEBT-06), so this is a shortcut to the debt's "I paid back" sheet, with the typed amount.
 */
function PayingBack({ amountText }: { amountText: string }) {
  const { colors } = useTheme();
  const owe = useRead((db) => readDebts(db).iOwe, []);
  const go = (href: Href) => router.replace(href);
  return (
    <View
      style={{
        borderTopWidth: 2,
        borderTopColor: colors.background,
        padding: space.md,
        gap: space.xs,
      }}
    >
      <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>
        Paying someone back?
      </Text>
      <Text style={[type.small, { color: colors.muted }]}>
        Pick the debt. Paying back isn't counted as spending.
      </Text>
      {owe.map((d) => (
        <Pressable
          key={d.id}
          accessibilityRole="button"
          accessibilityLabel={`Pay back ${d.name}, ${formatRM(d.outstandingSen)} left`}
          onPress={() =>
            go({
              pathname: "/debts/repay/[id]",
              params: amountText ? { id: d.id, amount: amountText } : { id: d.id },
            })
          }
          style={({ pressed }) => ({
            minHeight: MIN_TOUCH,
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>
            {d.name}
            {d.dueDate ? (
              <Text style={[type.small, { color: colors.muted }]}>
                {" "}
                · due {dayMonth(d.dueDate)}
              </Text>
            ) : null}
          </Text>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>
            {formatRM(d.outstandingSen)}
          </Text>
        </Pressable>
      ))}
      {owe.length === 0 ? (
        <Text style={[type.small, { color: colors.muted }]}>You don't owe anyone right now.</Text>
      ) : null}
      <Button variant="link" label="See all in Debts" onPress={() => go("/debts")} />
    </View>
  );
}

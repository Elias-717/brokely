import { DEFAULT_CATEGORIES, formatRM, parseAmount, sen, type LocalDate } from "@brokely/domain";
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
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { categoriesByUse } from "../src/lib/category-order";
import { categoryEmoji } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, occurredAtFor, today } from "../src/lib/today";
import { Button } from "../src/ui/components";
import { pickDate } from "../src/ui/date-picker";
import { Keypad } from "../src/ui/keypad";
import { SheetPanel } from "../src/ui/sheet";
import { Chip, Field, Labelled } from "../src/ui/sheet-parts";
import { fonts, MIN_TOUCH, radius, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";
import { useKeyboardOpen } from "../src/ui/use-keyboard";

type Mode = "spent" | "in" | "more";
type MoreKind = "transfer" | "lent" | "borrowed";

/** Names of the default categories; anything else was typed by the student under Other. */
const DEFAULT_NAMES = new Set(DEFAULT_CATEGORIES.map((c) => c.name));

const FRIEND = "From a friend";
/** Shortcut to More → I borrowed: saved as a debt, not money in. */
const BORROWED = "Borrowed (debt)";
const FROM = ["From family", "Meal money", FRIEND, "Part-time", "Gift", BORROWED, "Other"];
const MORE: { kind: MoreKind; label: string }[] = [
  { kind: "transfer", label: "Between my own wallets" },
  { kind: "lent", label: "I lent money" },
  { kind: "borrowed", label: "I borrowed money" },
];

/**
 * S4 / S4c Quick add (FR-TXN-01/02/03/10/11, FR-DEBT-01/05, D-01, D-24, D-26, D-28, D-38):
 * a fast plain form. Type the amount, tap a category, Save; then Undo for 5 seconds.
 * Refunds are made from a purchase in Records, because they must link to it (FR-TXN-06).
 */
export default function QuickAdd() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const keyboardOpen = useKeyboardOpen();
  const [noteFocused, setNoteFocused] = useState(false);
  const categories = useRead((db) => categoriesByUse(db, day), [day]);

  // Debts opens it on More → I lent / I borrowed (S7 "+ Add").
  const params = useLocalSearchParams<{ more?: MoreKind }>();
  const [mode, setMode] = useState<Mode>(params.more ? "more" : "spent");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState<LocalDate>(day);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Spent
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [split, setSplit] = useState(false);
  /** Under Other: the student's own category name (D-44). */
  const [customName, setCustomName] = useState("");
  const [friend, setFriend] = useState("");
  const [shareText, setShareText] = useState("");
  // Money in / More
  const [from, setFrom] = useState(FROM[0]!);
  const [moreKind, setMoreKind] = useState<MoreKind>(params.more ?? "transfer");
  const [person, setPerson] = useState("");

  const amount = parseAmount(amountText);
  const share = parseAmount(shareText);
  const picked = categories.find((c) => c.id === categoryId) ?? categories[0];
  // Categories the student named themselves before, offered again under Other (D-44).
  const ownCategories = categories.filter(
    (c) => !DEFAULT_NAMES.has(c.name) && c.kind !== "set_aside",
  );
  const showOwn =
    mode === "spent" && !!picked && (picked.name === "Other" || !DEFAULT_NAMES.has(picked.name));
  const when = { localDate: date, occurredAt: occurredAtFor(date, day) };
  const cleanNote = note.trim();

  /** Saves, then closes the sheet and offers Undo (D-38). */
  const finish = <T,>(result: RepoResult<T>, message: string, undo: (value: T) => void) => {
    if (!result.ok) return setProblem(refusalText(result.code, result.message));
    router.back();
    showUndo(message, () => undo(result.value));
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
    const label = `${picked.name} ${categoryEmoji(picked.name)}`.trim();
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
            : `Save ${formatRM(amount)}`;

  const chips = showAll ? categories : categories.slice(0, 4);

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
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
      <KeyboardAvoidingView behavior="padding">
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
                  color: colors.text,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatRM(amount ?? sen(0))}
              </Text>
            </>
          }
        >
          <ScrollView
            // Shrinks (and scrolls) when space is short, instead of pushing fields off screen.
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ gap: space.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {mode === "spent" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {chips.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.name} ${categoryEmoji(c.name)}`.trim()}
                    selected={c.id === picked?.id}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
                {!showAll && categories.length > 4 ? (
                  <Chip label="All categories" dashed onPress={() => setShowAll(true)} />
                ) : null}
              </View>
            ) : null}
            {showOwn ? (
              <View style={{ gap: space.sm }}>
                {picked?.name === "Other" ? (
                  <Field
                    value={customName}
                    onChange={setCustomName}
                    expanded
                    placeholder="Name it (optional), e.g. Haircut"
                    label="Name your own category, optional"
                  />
                ) : null}
                {ownCategories.length > 0 ? (
                  <Labelled label="Your own categories">
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                      {ownCategories.map((c) => (
                        <Chip
                          key={c.id}
                          label={c.name}
                          selected={c.id === picked?.id}
                          onPress={() => {
                            setCategoryId(c.id);
                            setCustomName("");
                          }}
                        />
                      ))}
                    </View>
                  </Labelled>
                ) : null}
              </View>
            ) : null}
            {mode === "in" ? (
              <Labelled label="From">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {FROM.map((f) => (
                    <Chip key={f} label={f} selected={f === from} onPress={() => setFrom(f)} />
                  ))}
                </View>
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
              </Labelled>
            ) : mode === "more" ? (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {MORE.map((m) => (
                    <Chip
                      key={m.kind}
                      label={m.label}
                      selected={m.kind === moreKind}
                      onPress={() => setMoreKind(m.kind)}
                    />
                  ))}
                </View>
                {moreKind !== "transfer" ? (
                  <Field
                    value={person}
                    onChange={setPerson}
                    expanded
                    placeholder={
                      moreKind === "lent" ? "Who did you lend to?" : "Who did you borrow from?"
                    }
                  />
                ) : (
                  <Text style={[type.small, { color: colors.muted }]}>
                    Moving money between your own wallets (e.g. bank to TNG) is never spending.
                  </Text>
                )}
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: space.sm }}>
              {/* While typing the note it gets the whole row. */}
              {noteFocused ? null : (
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
                  <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>
                    📅 {date === day ? `Today, ${dayMonth(day)}` : dayMonth(date)}
                  </Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }}>
                <Field
                  value={note}
                  onChange={setNote}
                  expanded
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                  placeholder="Note (optional)"
                  label="Note, optional. What was it? For example nasi lemak"
                />
              </View>
            </View>

            {mode === "spent" ? (
              <View
                style={{
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderColor: colors.outline,
                  backgroundColor: colors.card,
                  paddingHorizontal: space.sm,
                  gap: space.sm,
                  paddingBottom: split ? space.sm : 0,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: MIN_TOUCH,
                  }}
                >
                  <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>
                    Split with a friend
                  </Text>
                  <Switch
                    value={split}
                    onValueChange={setSplit}
                    accessibilityLabel="Split with a friend"
                    trackColor={{ true: colors.primary, false: colors.outline }}
                  />
                </View>
                {split ? (
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <View style={{ flex: 3 }}>
                      <Field
                        value={friend}
                        onChange={setFriend}
                        placeholder="Friend's name"
                        expanded
                      />
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
                ) : null}
                {split && amount !== null && share !== null && share > 0 && share < amount ? (
                  <Text style={[type.small, { color: colors.muted }]}>
                    Your share {formatRM(sen(amount - share))} counts as spending;{" "}
                    {friend.trim() || "your friend"} owes you {formatRM(share)}.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

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
      </KeyboardAvoidingView>
    </View>
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

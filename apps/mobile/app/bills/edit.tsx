import {
  billSuggestion,
  dayOfMonth,
  formatRM,
  localDate,
  parseAmount,
  type LocalDate,
  type RepeatRule,
} from "@brokely/domain";
import {
  addCategory,
  archiveBill,
  createBill,
  editBill,
  findCycleOn,
  getBill,
  listCategories,
  unarchiveBill,
  type BillView,
} from "@brokely/local-db";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { db, repo } from "../../src/db/client";
import { BILL_PRESETS, BILL_TYPES, billTypeOf, OTHER_BILLS } from "../../src/lib/bill-types";
import type { IconName } from "../../src/ui/icon";
import { describeRepeat } from "../../src/lib/bills-model";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, today } from "../../src/lib/today";
import { CategoryPicker } from "../../src/ui/category-picker";
import { Button, PageScreen } from "../../src/ui/components";
import { pickDate } from "../../src/ui/date-picker";
import { DateButton, SheetNote } from "../../src/ui/sheet";
import { Chip, Field, Labelled } from "../../src/ui/sheet-parts";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";

type RepeatKind = RepeatRule["kind"];

const KINDS: { kind: RepeatKind; label: string; icon: IconName }[] = [
  { kind: "monthly", label: "Monthly", icon: "calendar-blank" },
  { kind: "weekdays", label: "On some weekdays", icon: "calendar-check" },
  { kind: "every_n_weeks", label: "Every few weeks", icon: "arrows-clockwise" },
  { kind: "every_n_days", label: "Every few days", icon: "timer" },
  { kind: "daily", label: "Every day", icon: "sun" },
  { kind: "once", label: "Once", icon: "number-circle-one" },
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sen as text for the amount field: 1600 → "16.00". */
const asTyped = (amount: number) =>
  `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

export default function BillFormRoute() {
  const { id, preset } = useLocalSearchParams<{ id?: string; preset?: string }>();
  const bill = useMemo(() => (id ? getBill(db, id) : undefined), [id]);
  // Quick add on an empty Bills page opens the form filled in (D-77).
  const filled = BILL_PRESETS.find((p) => p.label === preset);
  return <BillForm bill={bill} preset={filled} />;
}

/**
 * New bill or change a bill (FR-CAT-03, FR-CAT-04, FR-CAT-07, D-17, D-57): name, amount each
 * time, the kind of bill (which decides its spending category), how it repeats and from when. Changes apply to upcoming dates only; paid ones stay.
 * Stop keeps the history and offers Undo.
 */
function BillForm({
  bill,
  preset,
}: {
  bill: BillView | undefined;
  preset?: (typeof BILL_PRESETS)[number];
}) {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const categories = useMemo(() => listCategories(db, { includeArchived: true }), []);
  const currentCategory = categories.find((c) => c.id === bill?.categoryId)?.name;
  const cycle = useMemo(() => findCycleOn(db, day), [day]);

  const rule = bill?.repeat;
  const [name, setName] = useState(bill?.name ?? preset?.label ?? "");
  const [amountText, setAmountText] = useState(bill ? asTyped(bill.amountSen) : "");
  // The kind of bill (D-57); a saved bill's kind comes from its category's name.
  const [typeName, setTypeName] = useState<string | null>(
    currentCategory ? billTypeOf(currentCategory).name : (preset?.type ?? null),
  );
  const [otherName, setOtherName] = useState(
    currentCategory && billTypeOf(currentCategory).name === OTHER_BILLS ? currentCategory : "",
  );
  const billType = BILL_TYPES.find((t) => t.name === typeName);
  const [kind, setKind] = useState<RepeatKind>(rule?.kind ?? "monthly");
  const [days, setDays] = useState<number[]>(rule?.kind === "weekdays" ? [...rule.days] : []);
  const [everyText, setEveryText] = useState(
    rule?.kind === "every_n_days" || rule?.kind === "every_n_weeks" ? String(rule.n) : "2",
  );
  const [anchor, setAnchor] = useState<LocalDate>(bill ? localDate(bill.anchorDate) : day);
  const [problem, setProblem] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const every = Number.parseInt(everyText, 10);

  const repeat = ((): RepeatRule | null => {
    switch (kind) {
      case "monthly":
        return { kind, day: dayOfMonth(anchor) };
      case "weekdays":
        return days.length > 0 ? { kind, days: [...days].sort() } : null;
      case "every_n_days":
      case "every_n_weeks":
        return Number.isInteger(every) && every >= 1 && every <= 365 ? { kind, n: every } : null;
      case "daily":
      case "once":
        return { kind };
    }
  })();

  // FR-PLN-06: show how many dates fall in this plan, so the student can plan for it.
  const inPlan =
    cycle && repeat && amount
      ? billSuggestion(amount, repeat, anchor, {
          start: localDate(cycle.startDate),
          endExclusive: localDate(cycle.endDateExclusive),
        })
      : null;

  const save = () => {
    if (name.trim() === "") return setProblem("Give it a name, e.g. Phone plan or Spotify.");
    if (amount === null || amount <= 0) return setProblem("Type how much it is each time.");
    if (!billType) return setProblem("Pick what kind of bill it is.");
    const categoryName = billType.name === OTHER_BILLS ? otherName.trim() : billType.category;
    if (!categoryName) return setProblem("Type what kind of bill it is, e.g. Club fees.");
    if (!repeat) {
      return setProblem(
        kind === "weekdays" ? "Pick at least one day." : "Type a number from 1 to 365.",
      );
    }
    // Its spending category: an existing one with that name, or a new one (D-57).
    const existing = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    let categoryId = existing?.id;
    if (!categoryId) {
      const added = addCategory(repo, { name: categoryName, kind: billType.kind });
      if (!added.ok) return setProblem(refusalText(added.code, added.message));
      categoryId = added.value.id;
    }
    const input = { name, amountSen: amount, categoryId, repeat, anchorDate: anchor };
    const saved = bill ? editBill(repo, bill.id, input) : createBill(repo, input);
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    router.back();
  };

  const stop = () => {
    if (!bill) return;
    const stopped = archiveBill(repo, bill.id);
    if (!stopped.ok) return setProblem(refusalText(stopped.code, stopped.message));
    router.back();
    showUndo(`Stopped ${bill.name}`, () => unarchiveBill(repo, bill.id));
  };

  return (
    <PageScreen title={bill ? "Change" : "New bill or subscription"} keyboardSafe>
      <Labelled label="Name">
        <Field
          value={name}
          onChange={setName}
          placeholder="e.g. Phone plan, Spotify"
          label="Name"
        />
      </Labelled>
      <Labelled label="How much each time (RM)">
        <Field
          value={amountText}
          onChange={setAmountText}
          placeholder="0.00"
          label="Amount each time"
          numeric
        />
      </Labelled>
      {/* One "Type" row and one "Repeats" row, like Category in quick add (D-57). */}
      <CategoryPicker
        title="Type of bill"
        categories={BILL_TYPES.map((t) => ({ id: t.name, name: t.name }))}
        selectedId={typeName}
        onSelect={(id) => {
          setTypeName(id);
          setProblem(null);
        }}
        iconOf={(n) => BILL_TYPES.find((t) => t.name === n)?.icon ?? "receipt"}
      />
      {typeName === OTHER_BILLS ? (
        <Field
          value={otherName}
          onChange={setOtherName}
          expanded
          placeholder="What kind of bill? e.g. Club fees"
          label="What kind of bill"
        />
      ) : null}
      <CategoryPicker
        title="Repeats"
        categories={KINDS.map((k) => ({ id: k.kind, name: k.label }))}
        selectedId={kind}
        onSelect={(id) => setKind(id as RepeatKind)}
        iconOf={(n) => KINDS.find((k) => k.label === n)?.icon ?? "calendar-blank"}
      />
      {kind === "weekdays" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {WEEKDAYS.map((label, d) => (
            <Chip
              key={label}
              label={label}
              selected={days.includes(d)}
              onPress={() =>
                setDays((now) => (now.includes(d) ? now.filter((x) => x !== d) : [...now, d]))
              }
            />
          ))}
        </View>
      ) : null}
      {kind === "every_n_days" || kind === "every_n_weeks" ? (
        <Labelled
          label={kind === "every_n_days" ? "Every how many days?" : "Every how many weeks?"}
        >
          <Field value={everyText} onChange={setEveryText} placeholder="2" numeric />
        </Labelled>
      ) : null}
      <Labelled label={kind === "once" ? "On" : "Starting from"}>
        <DateButton
          label={anchor === day ? `Today, ${dayMonth(day)}` : dayMonth(anchor)}
          accessibilityLabel={`${kind === "once" ? "On" : "Starting from"} ${dayMonth(anchor)}. Change`}
          onPress={async () => {
            const chosen = await pickDate(anchor);
            if (chosen) setAnchor(chosen);
          }}
        />
      </Labelled>

      {repeat ? (
        <SheetNote
          title={describeRepeat(repeat, anchor)}
          detail={
            !cycle
              ? "Its dates show up in Still to come once you have a plan."
              : inPlan && inPlan.count > 0
                ? `In this plan: ${inPlan.count} × ${formatRM(amount!)} = ${formatRM(inPlan.totalSen)}, shown in Still to come.`
                : inPlan
                  ? "No dates fall in this plan; it'll show in the next one."
                  : undefined
          }
        />
      ) : null}
      {bill ? (
        <Text style={[type.small, { color: colors.muted }]}>
          Changes apply to dates still to come. Bills you already paid stay as they were.
        </Text>
      ) : null}

      {problem ? (
        <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
          {problem}
        </Text>
      ) : null}
      <Button label={bill ? "Save changes" : "Add it"} onPress={save} />
      {bill ? <Button label="Stop this one" variant="secondary" onPress={stop} /> : null}
    </PageScreen>
  );
}

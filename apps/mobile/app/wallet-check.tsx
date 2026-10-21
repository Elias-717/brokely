import { formatRM, localDate, parseAmount, sen, type Sen } from "@brokely/domain";
import {
  compareWithLastCheck,
  deleteTransaction,
  logWalletDifference,
  recordWalletCheck,
  type WalletComparison,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { categoriesByUse } from "../src/lib/category-order";
import { categoryEmoji } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today, weekdayName } from "../src/lib/today";
import { asTyped } from "../src/ui/allocation-fields";
import { Button, Sticker } from "../src/ui/components";
import { Keypad } from "../src/ui/keypad";
import { SheetShell } from "../src/ui/sheet";
import { Chip } from "../src/ui/sheet-parts";
import { fonts, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

type Part = "cash" | "tng" | "bank";
const PARTS: { key: Part; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "tng", label: "TNG" },
  { key: "bank", label: "Bank" },
];
/** Categories shown before "All" when logging a difference as spending. */
const FIRST_CATEGORIES = 5;

/** "Mon, 16 Nov" for the check a comparison is based on (FR-WAL-04). */
const checkDay = (localDateText: string) => {
  const d = localDate(localDateText);
  return `${weekdayName(d).slice(0, 3)}, ${dayMonth(d)}`;
};

/**
 * S11 Wallet check (FR-WAL-01…04, BR-30, BR-31, D-27, D-85, AC-62, AC-63). Optional: the
 * student counts the money they have, as Cash / TNG / Bank that add up, or one total. What
 * their records say stays hidden until the check is saved, so it never steers the count. The
 * result compares side by side, worded from the last check, never as a balance; a difference
 * is logged only on a tap.
 */
export default function WalletCheckSheet() {
  const day = useMemo(() => today(), []);
  const last = useMemo(
    () => compareWithLastCheck(db, sen(0), new Date().toISOString())?.lastCheck ?? null,
    [],
  );
  const [saved, setSaved] = useState<{
    id: string;
    countedSen: Sen;
    comparison: WalletComparison | null;
  } | null>(null);

  return saved ? (
    <Result day={day} {...saved} />
  ) : (
    <Count lastCheckDate={last?.localDate ?? null} day={day} onSaved={setSaved} />
  );
}

/** Step 1: count. */
function Count({
  lastCheckDate,
  day,
  onSaved,
}: {
  lastCheckDate: string | null;
  day: string;
  onSaved: (saved: { id: string; countedSen: Sen; comparison: WalletComparison | null }) => void;
}) {
  const { colors } = useTheme();
  const [parts, setParts] = useState<Record<Part, string>>({ cash: "", tng: "", bank: "" });
  const [active, setActive] = useState<Part | "total">("cash");
  const [totalText, setTotalText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const partSen = (k: Part) => parseAmount(parts[k]) ?? 0;
  const byParts = active !== "total";
  const sum = PARTS.reduce((total, p) => total + partSen(p.key), 0);
  const anyPart = PARTS.some((p) => parts[p.key].trim() !== "");
  const amount: Sen | null = byParts ? (anyPart ? sen(sum) : null) : parseAmount(totalText);

  const save = () => {
    if (amount === null) return setProblem("Type how much money you have, even RM0.");
    // The breakdown is kept with the check, e.g. "Cash RM 45.00 · TNG RM 120.00".
    const note = byParts
      ? PARTS.filter((p) => partSen(p.key) > 0)
          .map((p) => `${p.label} ${formatRM(sen(partSen(p.key)))}`)
          .join(" · ")
      : "";
    const result = recordWalletCheck(repo, { amountSen: amount, localDate: day, note });
    if (!result.ok) return setProblem(refusalText(result.code, result.message));
    onSaved({ ...result.value, countedSen: amount });
  };

  return (
    <SheetShell
      title="Wallet check"
      subtitle="Optional"
      footer={
        <>
          <Keypad
            value={byParts ? parts[active as Part] : totalText}
            onChange={(next) => {
              if (byParts) setParts((now) => ({ ...now, [active]: next }));
              else setTotalText(next);
              setProblem(null);
            }}
          />
          {problem ? (
            <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}
          <Button
            label={amount === null ? "Save my check" : `Save my check · ${formatRM(amount)}`}
            onPress={save}
            disabled={amount === null}
          />
        </>
      }
    >
      <Text style={[type.body, { color: colors.muted }]}>
        {lastCheckDate
          ? `How much money do you have right now? Last check: ${checkDay(lastCheckDate)}.`
          : "How much money do you have right now? Your first check is just a starting point."}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {PARTS.map((p) => (
          <Choice
            key={p.key}
            selected={active === p.key}
            label={`${p.label}, ${formatRM(sen(partSen(p.key)))}. Type the amount`}
            onPress={() => setActive(p.key)}
            flex
          >
            <Text style={[type.small, { color: colors.muted }]}>{p.label}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontFamily: fonts.heavy,
                fontSize: 15,
                color: parts[p.key] ? colors.text : colors.muted,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatRM(sen(partSen(p.key)))}
            </Text>
          </Choice>
        ))}
      </View>
      <Choice
        selected={!byParts}
        label={`All together, ${formatRM(amount ?? sen(0))}. Type only the total`}
        onPress={() => {
          // Keep what was added up so far as the starting total.
          if (byParts) setTotalText(anyPart ? asTyped(sum) : "");
          setActive("total");
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
            All together
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[type.heading, { fontSize: 28, lineHeight: 32, color: colors.text }]}
          >
            {formatRM(amount ?? sen(0))}
          </Text>
        </View>
      </Choice>
      <Text style={[type.small, { color: colors.muted }]}>
        {byParts
          ? `Typing into ${PARTS.find((p) => p.key === active)!.label}. Know only the total? Tap All together.`
          : "Typing the total. Tap Cash, TNG or Bank to add them up instead."}
      </Text>
    </SheetShell>
  );
}

/** A tile you tap to type into it: green outline and tint while chosen. */
function Choice({
  selected,
  label,
  onPress,
  flex,
  children,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  flex?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flex: flex ? 1 : undefined, opacity: pressed ? 0.8 : 1 })}
    >
      <Sticker
        rounded={12}
        offset={2}
        background={selected ? colors.cardTint : colors.card}
        outline={selected ? colors.primary : colors.outline}
        style={{
          minHeight: 56,
          justifyContent: "center",
          paddingHorizontal: space.sm + 2,
          paddingVertical: space.sm,
          gap: 2,
          borderWidth: selected ? 3 : 2,
        }}
      >
        {children}
      </Sticker>
    </Pressable>
  );
}

/** Step 2: how it compares, and what to do about a difference. */
function Result({
  id,
  countedSen,
  comparison,
  day,
}: {
  id: string;
  countedSen: Sen;
  comparison: WalletComparison | null;
  day: string;
}) {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const categories = useMemo(
    () => categoriesByUse(db, localDate(day)).filter((c) => c.kind !== "set_aside"),
    [day],
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const diff = comparison?.difference;
  const picked = categories.find((c) => c.id === categoryId);

  const logIt = () => {
    const logged = logWalletDifference(repo, { checkId: id, categoryId: categoryId ?? undefined });
    if (!logged.ok) return setProblem(refusalText(logged.code, logged.message));
    router.back();
    showUndo("Logged the difference", () => deleteTransaction(repo, logged.value.id));
  };

  const footer = (
    <>
      {problem ? (
        <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
          {problem}
        </Text>
      ) : null}
      {diff?.kind === "missing" ? (
        <>
          <Button
            label={
              picked
                ? `Log it · ${formatRM(diff.amountSen)} in ${picked.name}`
                : "Pick where it went to log it"
            }
            onPress={logIt}
            disabled={!picked}
          />
          <Button label="Leave it" variant="secondary" onPress={() => router.back()} />
        </>
      ) : diff?.kind === "extra" ? (
        <>
          <Button label={`Log it as money in · ${formatRM(diff.amountSen)}`} onPress={logIt} />
          <Button label="Leave it" variant="secondary" onPress={() => router.back()} />
        </>
      ) : (
        <Button label="Done" onPress={() => router.back()} />
      )}
    </>
  );

  // First check, or it matches: a small win.
  if (!comparison || !diff || diff.kind === "match") {
    return (
      <SheetShell
        title="Wallet check"
        subtitle={`Saved · ${dayMonth(localDate(day))}`}
        footer={footer}
      >
        <Image
          source={require("../assets/mascot/brokely_s1_happy.png")}
          style={{ width: "100%", height: 160 }}
          resizeMode="contain"
          accessibilityLabel="Brokely, happy"
        />
        <Sticker
          background={colors.cardTint}
          style={{ padding: space.md, gap: space.xs, alignItems: "center" }}
        >
          <Text
            accessibilityRole="header"
            style={[
              type.heading,
              { fontSize: 24, lineHeight: 28, color: colors.text, textAlign: "center" },
            ]}
          >
            {comparison ? "It matches your records!" : "Your starting point is set"}
          </Text>
          <Text style={[type.small, { fontSize: 14, color: colors.muted, textAlign: "center" }]}>
            {comparison
              ? `${formatRM(countedSen)} counted · ${formatRM(comparison.expectedSen)} in your records, based on your check on ${checkDay(comparison.lastCheck.localDate)}.`
              : `${formatRM(countedSen)} counted. Next time, Brokely compares your check with what you log in between.`}
          </Text>
        </Sticker>
      </SheetShell>
    );
  }

  const missing = diff.kind === "missing";
  const shown = showAll ? categories : categories.slice(0, FIRST_CATEGORIES);
  return (
    <SheetShell
      title="Wallet check"
      subtitle={`Saved · ${dayMonth(localDate(day))}`}
      footer={footer}
    >
      <Sticker style={{ padding: 0, overflow: "hidden" }}>
        <CompareRow
          title="Your records say"
          detail={`Since your check on ${checkDay(comparison.lastCheck.localDate)}`}
          amount={formatRM(comparison.expectedSen)}
        />
        <CompareRow
          title="You counted"
          detail="Cash, TNG and bank"
          amount={formatRM(countedSen)}
          divided
        />
        <View
          accessible
          accessibilityLabel={`${missing ? "Not in your records" : "More than your records"}: ${formatRM(diff.amountSen)}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            paddingHorizontal: space.md,
            paddingVertical: 12,
            backgroundColor: colors.warningCard,
            borderTopWidth: 2,
            borderTopColor: colors.outline,
          }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
            {missing ? "Not in your records" : "More than your records"}
          </Text>
          <Text
            style={[
              type.heading,
              { fontSize: 24, lineHeight: 28, color: missing ? colors.expense : colors.income },
            ]}
          >
            {formatRM(diff.amountSen)}
          </Text>
        </View>
      </Sticker>
      <Text style={[type.body, { color: colors.text }]}>
        {missing
          ? "Happens to everyone! Log it as spending? Pick where it most likely went."
          : "Got money you didn't log, like meal money or a gift? Log the extra as money in."}
      </Text>
      {missing ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {shown.map((c) => (
            <Chip
              key={c.id}
              label={`${categoryEmoji(c.name)} ${c.name}`.trim()}
              selected={c.id === categoryId}
              onPress={() => {
                setCategoryId(c.id);
                setProblem(null);
              }}
            />
          ))}
          {categories.length > FIRST_CATEGORIES ? (
            <Chip
              label={showAll ? "Fewer" : "All ▾"}
              dashed
              onPress={() => setShowAll((s) => !s)}
            />
          ) : null}
        </View>
      ) : null}
    </SheetShell>
  );
}

function CompareRow({
  title,
  detail,
  amount,
  divided,
}: {
  title: string;
  detail: string;
  amount: string;
  divided?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${amount}. ${detail}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: 12,
        borderTopWidth: divided ? 2 : 0,
        borderTopColor: colors.background,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>{title}</Text>
        <Text style={[type.small, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 17,
          color: colors.text,
          fontVariant: ["tabular-nums"],
        }}
      >
        {amount}
      </Text>
    </View>
  );
}

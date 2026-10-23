import { parseAmount, sen, type AllocationInput, type Sen } from "@brokely/domain";
import type { listCategories } from "@brokely/local-db";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Heading, Sticker } from "./components";
import { Field } from "./sheet-parts";
import { fonts, space, type } from "./theme";
import { useTheme } from "./theme-context";

type Category = ReturnType<typeof listCategories>[number];

/** Essentials first, then optional and set-asides (FR-PLN-05, FR-PLN-12). */
export const PLAN_GROUPS = [
  { title: "Essentials", kinds: ["essential"] },
  { title: "Optional · set aside", kinds: ["optional", "set_aside"] },
] as const;

export function GroupLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.5, color: colors.muted }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

/**
 * The shown categories as compact rows, name left and amount box right, in PLAN_GROUPS
 * (Change amounts on Your plan, step 3 of Plan step by step; D-81).
 */
export function AmountFieldGroups({
  categories,
  amounts,
  onChange,
  hints,
}: {
  categories: readonly Category[];
  amounts: Record<string, string>;
  onChange: (categoryId: string, text: string) => void;
  /** A quiet line under a category's name, e.g. what was spent last plan (D-46 part 2). */
  hints?: ReadonlyMap<string, string>;
}) {
  const { colors } = useTheme();
  return (
    <>
      {PLAN_GROUPS.map((g) => {
        const rows = categories.filter((c) => (g.kinds as readonly string[]).includes(c.kind));
        if (rows.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: space.xs }}>
            <GroupLabel>{g.title}</GroupLabel>
            <Sticker style={{ padding: 0 }}>
              {rows.map((c, i) => (
                <View
                  key={c.id}
                  style={{
                    minHeight: 56,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingVertical: 6,
                    paddingHorizontal: space.md,
                    borderTopWidth: i === 0 ? 0 : 2,
                    borderTopColor: colors.background,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[type.strong, { color: colors.text }]}>
                      {c.kind === "set_aside" ? `${c.name} · set aside` : c.name}
                    </Text>
                    {hints?.get(c.id) ? (
                      <Text style={[type.small, { color: colors.muted }]}>{hints.get(c.id)}</Text>
                    ) : null}
                  </View>
                  <View style={{ width: 118 }}>
                    <Field
                      value={amounts[c.id] ?? ""}
                      onChange={(text) => onChange(c.id, text)}
                      placeholder="0.00"
                      label={`${c.name} amount`}
                      numeric
                    />
                  </View>
                </View>
              ))}
            </Sticker>
          </View>
        );
      })}
    </>
  );
}

const GROUPS = [
  { kind: "essential", title: "Essentials" },
  { kind: "optional", title: "Optional" },
  { kind: "set_aside", title: "Set aside" },
] as const;

/** Sen as editable text; empty for zero so the field shows its placeholder. */
export const asTyped = (amount: number) =>
  amount === 0 ? "" : `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

/** The typed amounts as plan allocations; `bad` names the first one that isn't a number. */
export function readAllocations(categories: readonly Category[], amounts: Record<string, string>) {
  const parsed = categories.map((c) => ({
    c,
    amount: amounts[c.id]?.trim() ? parseAmount(amounts[c.id]!) : sen(0),
  }));
  const bad = parsed.find((p) => p.amount === null)?.c;
  const allocations: (AllocationInput & { categoryId: string })[] = parsed
    .filter((p) => (p.amount ?? 0) > 0)
    .map((p) => ({ categoryId: p.c.id, kind: p.c.kind, amountSen: p.amount as Sen }));
  return { allocations, bad };
}

/**
 * Every category's amount, grouped Essentials / Optional / Set aside (FR-PLN-05, FR-PLN-12).
 * `setAsideExtra` sits at the end of the set-aside group, e.g. "add a set-aside".
 */
export function AllocationFields({
  categories,
  amounts,
  onChange,
  setAsideExtra,
  hints,
}: {
  categories: readonly Category[];
  amounts: Record<string, string>;
  onChange: (categoryId: string, text: string) => void;
  setAsideExtra?: ReactNode;
  /** A quiet line under a category's name, e.g. what was spent last plan (D-46 part 2). */
  hints?: ReadonlyMap<string, string>;
}) {
  const { colors } = useTheme();
  return (
    <>
      {GROUPS.map((g) => {
        const inGroup = categories.filter((c) => c.kind === g.kind);
        if (inGroup.length === 0) return null;
        return (
          <Sticker key={g.kind} style={{ padding: space.md, gap: space.sm }}>
            <Heading>{g.title}</Heading>
            {inGroup.map((c) => (
              <View
                key={c.id}
                style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.strong, { color: colors.text }]}>{c.name}</Text>
                  {hints?.get(c.id) ? (
                    <Text style={[type.small, { color: colors.muted }]}>{hints.get(c.id)}</Text>
                  ) : null}
                </View>
                <View style={{ width: 120 }}>
                  <Field
                    value={amounts[c.id] ?? ""}
                    onChange={(text) => onChange(c.id, text)}
                    placeholder="0.00"
                    label={`${c.name} amount`}
                    numeric
                  />
                </View>
              </View>
            ))}
            {g.kind === "set_aside" ? setAsideExtra : null}
          </Sticker>
        );
      })}
    </>
  );
}

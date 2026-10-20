import { parseAmount, sen, type AllocationInput, type Sen } from "@brokely/domain";
import type { listCategories } from "@brokely/local-db";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { categoryEmoji } from "../lib/essentials-meta";
import { Heading, Sticker } from "./components";
import { Field } from "./sheet-parts";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

type Category = ReturnType<typeof listCategories>[number];

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
}: {
  categories: readonly Category[];
  amounts: Record<string, string>;
  onChange: (categoryId: string, text: string) => void;
  setAsideExtra?: ReactNode;
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
                <Text style={[type.strong, { flex: 1, color: colors.text }]}>
                  {c.name} {categoryEmoji(c.name)}
                </Text>
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

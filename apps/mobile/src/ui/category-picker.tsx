import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { categoryIcon } from "../lib/essentials-meta";
import { Icon, type IconName } from "./icon";
import { fonts, MIN_TOUCH, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

interface PickerCategory {
  readonly id: string;
  readonly name: string;
}

/**
 * One tidy "Category" (or "From") row instead of a wall of chips (D-51, D-55). It shows the chosen category; a tap
 * opens the full list, choosing one closes it again. The list keeps the order it is given
 * (quick add passes most-used first).
 */
export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  title = "Category",
  iconOf = categoryIcon,
  footer,
}: {
  categories: readonly PickerCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The small label above the choice, e.g. "From" for money in. */
  title?: string;
  iconOf?: (name: string) => IconName;
  /** Shown under the open list, e.g. "Paying someone back?" in quick add (D-104). */
  footer?: (close: () => void) => ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === selectedId);

  return (
    <View
      style={{
        borderRadius: radius.button,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}: ${selected?.name ?? "none"}. ${open ? "Close the list" : "Change"}`}
        onPress={() => setOpen((now) => !now)}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH + 4,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: space.md,
          gap: space.sm,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.small, { color: colors.muted }]}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {selected ? <Icon name={iconOf(selected.name)} size={22} /> : null}
            <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.text }}>
              {selected ? selected.name : `Choose ${title.toLowerCase()}`}
            </Text>
          </View>
        </View>
        <Text style={[type.heading, { color: colors.muted }]}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open
        ? categories.map((c) => {
            const on = c.id === selectedId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  paddingHorizontal: space.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.background,
                  backgroundColor: on ? colors.cardTint : undefined,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Icon name={iconOf(c.name)} size={22} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: on ? fonts.heavy : fonts.bold,
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  {c.name}
                </Text>
                {on ? <Text style={[type.strong, { color: colors.primary }]}>✓</Text> : null}
              </Pressable>
            );
          })
        : null}
      {open && footer ? footer(() => setOpen(false)) : null}
    </View>
  );
}

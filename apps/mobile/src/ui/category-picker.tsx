import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { categoryEmoji } from "../lib/essentials-meta";
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
  emojiOf = categoryEmoji,
}: {
  categories: readonly PickerCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The small label above the choice, e.g. "From" for money in. */
  title?: string;
  emojiOf?: (name: string) => string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === selectedId);
  const label = (c: PickerCategory) => `${emojiOf(c.name) || "🏷️"}  ${c.name}`;

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
          <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.text }}>
            {selected ? label(selected) : `Choose ${title.toLowerCase()}`}
          </Text>
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
                  paddingHorizontal: space.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.background,
                  backgroundColor: on ? colors.cardTint : undefined,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: on ? fonts.heavy : fonts.bold,
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  {label(c)}
                </Text>
                {on ? <Text style={[type.strong, { color: colors.primary }]}>✓</Text> : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

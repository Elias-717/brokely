import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { BrokelyAvatar } from "./chat";
import { Sticker } from "./components";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * Brokely suggests one step on Home (essential cards FR-PLN-20, money in FR-TXN-11): his picture,
 * a small uppercase label, one message and a row of buttons. Every suggestion card uses this, so
 * they look the same and a style change happens in one place.
 */
export function BrokelyCard({
  label,
  children,
  actions,
}: {
  label: string;
  /** The message; may hold nested <Text> for bold parts. */
  children: ReactNode;
  /** Buttons, the main step first. */
  actions: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        <BrokelyAvatar size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.small, { color: colors.muted, textTransform: "uppercase" }]}>
            {label}
          </Text>
          <Text style={[type.body, { color: colors.text }]}>{children}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
        {actions}
      </View>
    </Sticker>
  );
}

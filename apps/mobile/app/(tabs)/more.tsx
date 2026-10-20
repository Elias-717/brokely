import { getNickname, NICKNAME_MAX, setNickname, type Appearance } from "@brokely/local-db";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { Body, Button, Card, Heading, Screen, Title } from "../../src/ui/components";
import { fonts, radius, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const CHOICES: { value: Appearance; label: string }[] = [
  { value: "system", label: "Same as phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Places under More (D-24): Bills, Debts and the rest open from here. */
const PLACES: { label: string; detail: string; href: Href }[] = [
  { label: "Bills", detail: "Upcoming, paid, add a bill", href: "/bills" },
  { label: "Debts", detail: "Who owes you, who you owe", href: "/debts" },
];

/** S9 More: places (Bills…), what Brokely calls you (D-34) and Appearance (D-32). */
export default function MoreScreen() {
  const { colors, appearance, setAppearance } = useTheme();
  const saved = useRead(getNickname);
  const [name, setName] = useState(saved ?? "");

  return (
    <Screen>
      <Title>More</Title>
      <Card style={{ padding: 0, gap: 0 }}>
        {PLACES.map((place, i) => (
          <Pressable
            key={place.label}
            accessibilityRole="button"
            onPress={() => router.push(place.href)}
            style={({ pressed }) => ({
              minHeight: 56,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              flexDirection: "row",
              alignItems: "center",
              borderTopWidth: i === 0 ? 0 : 2,
              borderTopColor: colors.background,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={[type.strong, { color: colors.text }]}>{place.label}</Text>
              <Text style={[type.small, { color: colors.muted }]}>{place.detail}</Text>
            </View>
            <Text style={[type.heading, { color: colors.muted }]}>›</Text>
          </Pressable>
        ))}
      </Card>
      <Card>
        <Heading>What Brokely calls you</Heading>
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={() => setNickname(repo, name)}
          maxLength={NICKNAME_MAX}
          placeholder="Your name or nickname (optional)"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="What Brokely calls you"
          style={{
            height: 52,
            borderWidth: 2,
            borderColor: colors.outline,
            borderRadius: radius.button,
            backgroundColor: colors.background,
            paddingHorizontal: space.md,
            fontFamily: fonts.bold,
            fontSize: 17,
            color: colors.text,
          }}
        />
        <Text style={[type.small, { color: colors.muted }]}>Kept on this phone only.</Text>
      </Card>
      <Card>
        <Heading>Appearance</Heading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {CHOICES.map((choice) => (
            <Button
              key={choice.value}
              label={choice.label}
              variant="secondary"
              selected={appearance === choice.value}
              onPress={() => setAppearance(choice.value)}
            />
          ))}
        </View>
      </Card>
      <Body muted>Plan, wallet check and your data — coming next.</Body>
    </Screen>
  );
}

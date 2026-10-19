import { getNickname, NICKNAME_MAX, setNickname, type Appearance } from "@brokely/local-db";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
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

/** S9 More. For now: what Brokely calls you (D-34) and Appearance (D-32). */
export default function MoreScreen() {
  const { colors, appearance, setAppearance } = useTheme();
  const saved = useRead(getNickname);
  const [name, setName] = useState(saved ?? "");

  return (
    <Screen>
      <Title>More</Title>
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
      <Body muted>Plan, bills, debts, wallet check and your data — coming next.</Body>
    </Screen>
  );
}

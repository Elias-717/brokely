import type { Appearance } from "@brokely/local-db";
import { View } from "react-native";
import { Body, Button, Card, Heading, Screen, Title } from "../../src/ui/components";
import { space } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const CHOICES: { value: Appearance; label: string }[] = [
  { value: "system", label: "Same as phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** S9 More. For now only Appearance (D-32); plan, bills, debts and your data come later. */
export default function MoreScreen() {
  const { appearance, setAppearance } = useTheme();
  return (
    <Screen>
      <Title>More</Title>
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

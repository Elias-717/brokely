import { router } from "expo-router";
import { Body, Button, Screen, Title } from "../src/ui/components";

export default function QuickAddScreen() {
  return (
    <Screen>
      <Title>Quick add</Title>
      <Body muted>S4 — coming next</Body>
      <Button label="Close" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

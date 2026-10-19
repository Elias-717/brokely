import { router } from "expo-router";
import { Body, Button, Screen, Title } from "../src/ui/components";

export default function QuickStartScreen() {
  return (
    <Screen>
      <Title>Quick start</Title>
      <Body muted>S1b / S1c / S1d — coming next</Body>
      <Button label="Skip for now" variant="secondary" onPress={() => router.replace("/")} />
    </Screen>
  );
}

import {
  deleteAllData,
  exportJson,
  linkedAccount,
  listCategories,
  seedDefaultCategories,
  signInStep,
  type SignInStep,
} from "@brokely/local-db";
import type { Session } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { shareExportFile } from "../src/lib/export-file";
import { today } from "../src/lib/today";
import {
  createAccount,
  MIN_PASSWORD,
  sendPasswordReset,
  signInWithEmail,
  signOutHere,
} from "../src/sync/auth";
import { useSync } from "../src/sync/sync-provider";
import { accountHasRecords, OfflineError } from "../src/sync/transport";
import { Body, Button, Card, Heading, PageScreen, Sticker } from "../src/ui/components";
import { TextField } from "../src/ui/text-field";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

type Mode = "sign-in" | "create" | "forgot";
type Phase =
  | { kind: "form" }
  | { kind: "working"; text: string }
  | { kind: "check-email"; email: string; why: "confirm" | "reset" }
  | { kind: "choose"; step: Extract<SignInStep, "ask" | "other-account"> }
  | { kind: "confirm-erase" };

/**
 * Sign in (D-72, D-74): from Welcome ("Already used Brokely?") or from More → Settings.
 * Email + password here; Google joins once its client ID is set (config.ts).
 * After signing in, what happens to this phone's records follows D-73:
 * this account's phone or an empty account → sync; only the first-run setup → replaced by the
 * account's records; both have records → the student chooses; another account's phone → never mixed.
 */
export default function SignInScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { colors } = useTheme();
  const { session, linked, waiting, sync } = useSync();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [message, setMessage] = useState<string | null>(null);

  /** Where to go once the phone and the account agree. */
  const leave = () => {
    const hasPlanSetup = listCategories(db, { includeArchived: true }).length > 0;
    if (from === "welcome" && !hasPlanSetup) {
      // An account without records: start like a new student (AC-52).
      seedDefaultCategories(repo);
      router.replace("/quick-start");
    } else if (from === "welcome") {
      router.replace("/");
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/more");
    }
  };

  const finish = async () => {
    setPhase({ kind: "working", text: "Bringing your records up to date…" });
    const report = await sync({ firstLink: true });
    if (!report) {
      setMessage(
        "Signed in. Brokely couldn't reach the server yet; it will back up when you're online.",
      );
    }
    leave();
  };

  const afterSignIn = async (current: Session) => {
    setMessage(null);
    setPhase({ kind: "working", text: "Checking your account…" });
    try {
      const linkedTo = linkedAccount(db);
      let step: SignInStep =
        linkedTo !== undefined
          ? linkedTo === current.user.id
            ? "sync"
            : "other-account"
          : signInStep(db, current.user.id, await accountHasRecords());
      if (step === "replace") {
        deleteAllData(db); // only the untouched first-run setup was here (D-73 b)
        step = "sync";
      }
      if (step === "sync") return await finish();
      setPhase({ kind: "choose", step });
    } catch (error) {
      setPhase({ kind: "form" });
      setMessage(
        error instanceof OfflineError
          ? "No internet connection. Connect and try again; you're still signed in."
          : "Something went wrong while checking your account. Please try again.",
      );
    }
  };

  // Opened while signed in but not linked yet, e.g. back from the reset link (a sign-in from the
  // form continues in submit, while the phase is "working", so it never runs twice).
  useEffect(() => {
    if (session && !linked && phase.kind === "form") void afterSignIn(session);
    else if (session && linked && phase.kind === "form") leave();
    // Only when the session itself changes.
  }, [session?.user.id]);

  const submit = async () => {
    setMessage(null);
    if (!email.includes("@")) return setMessage("Please type your email address.");
    if (mode === "forgot") {
      setPhase({ kind: "working", text: "Sending the email…" });
      const sent = await sendPasswordReset(email);
      if (!sent.ok) {
        setPhase({ kind: "form" });
        return setMessage(sent.message);
      }
      return setPhase({ kind: "check-email", email, why: "reset" });
    }
    setPhase({
      kind: "working",
      text: mode === "create" ? "Creating your account…" : "Signing in…",
    });
    const result =
      mode === "create"
        ? await createAccount(email, password)
        : await signInWithEmail(email, password);
    if (!result.ok) {
      setPhase({ kind: "form" });
      return setMessage(result.message);
    }
    if (!result.session) return setPhase({ kind: "check-email", email, why: "confirm" });
    await afterSignIn(result.session);
  };

  const exportFirst = () =>
    void shareExportFile(
      `brokely-data-${today()}.json`,
      "application/json",
      exportJson(db, new Date().toISOString()),
    );

  const eraseAndUseAccount = async () => {
    deleteAllData(db);
    await finish();
  };

  const useAnotherAccount = async () => {
    await signOutHere();
    setPassword("");
    setPhase({ kind: "form" });
  };

  return (
    <PageScreen title={mode === "create" ? "Create an account" : "Back up and sync"}>
      {phase.kind === "working" ? (
        <Card style={{ alignItems: "center", paddingVertical: space.lg }}>
          <ActivityIndicator color={colors.primary} />
          <Body muted>{phase.text}</Body>
        </Card>
      ) : null}

      {phase.kind === "check-email" ? (
        <Card>
          <Heading>Check your email</Heading>
          <Body>
            {phase.why === "confirm"
              ? `We sent a link to ${phase.email}. Open it to confirm your account, then come back and sign in.`
              : `If ${phase.email} has an account, we sent it a link to choose a new password.`}
          </Body>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => {
              setMode("sign-in");
              setPhase({ kind: "form" });
            }}
          />
        </Card>
      ) : null}

      {phase.kind === "choose" && phase.step === "other-account" ? (
        <Card>
          <Heading>This phone has someone else's records</Heading>
          <Body>
            The records on this phone belong to another account. Brokely never mixes two people's
            money, so sign in with that account, or erase this phone first.
          </Body>
          <Button label="Use the other account" onPress={() => void useAnotherAccount()} />
          <Button
            label={`Erase this phone and use ${session?.user.email ?? "this account"}`}
            variant="secondary"
            onPress={() => setPhase({ kind: "confirm-erase" })}
          />
        </Card>
      ) : null}

      {phase.kind === "choose" && phase.step === "ask" ? (
        <Card>
          <Heading>Your account already has records</Heading>
          <Body>This phone has records of its own too. Which ones do you want to keep using?</Body>
          <Button
            label="Use my account's records"
            onPress={() => setPhase({ kind: "confirm-erase" })}
          />
          <Button
            label="Add this phone's records to my account"
            variant="secondary"
            onPress={() => void finish()}
          />
          <Text style={[type.small, { color: colors.muted }]}>
            Adding keeps both. A plan for the same dates as one in your account can't be added and
            will be marked for you to look at.
          </Text>
        </Card>
      ) : null}

      {phase.kind === "confirm-erase" ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            Erase everything on this phone, then download your account's records?
            {waiting > 0
              ? ` ${waiting} ${waiting === 1 ? "change is" : "changes are"} not backed up anywhere and will be lost.`
              : ""}{" "}
            Export first if you want a copy.
          </Text>
          <Button label="Export everything first" variant="secondary" onPress={exportFirst} />
          <Button label="Erase and continue" onPress={() => void eraseAndUseAccount()} />
          <Button label="Cancel" variant="link" onPress={() => setPhase({ kind: "form" })} />
        </Sticker>
      ) : null}

      {phase.kind === "form" && !session ? (
        <Card>
          <Body muted>
            {from === "welcome"
              ? "Sign in to bring back your plan and records."
              : "Keep a backup of your records and use Brokely on more than one phone. Optional: everything works without an account."}
          </Body>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          {mode === "forgot" ? null : (
            <TextField
              label={
                mode === "create" ? `Password (at least ${MIN_PASSWORD} characters)` : "Password"
              }
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              textContentType={mode === "create" ? "newPassword" : "password"}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          )}
          {message ? (
            <Text accessibilityLiveRegion="polite" style={[type.strong, { color: colors.text }]}>
              {message}
            </Text>
          ) : null}
          <Button
            label={
              mode === "create"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Sign in"
            }
            onPress={() => void submit()}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {mode === "sign-in" ? (
              <>
                <Button
                  label="New here? Create an account"
                  variant="link"
                  onPress={() => setMode("create")}
                />
                <Button label="Forgot password?" variant="link" onPress={() => setMode("forgot")} />
              </>
            ) : (
              <Button
                label="I have an account: sign in"
                variant="link"
                onPress={() => setMode("sign-in")}
              />
            )}
          </View>
        </Card>
      ) : null}

      {phase.kind === "form" && session && message ? (
        <Card>
          <Body>{message}</Body>
          <Button label="Try again" onPress={() => void afterSignIn(session)} />
          <Button label="Sign out" variant="link" onPress={() => void useAnotherAccount()} />
        </Card>
      ) : null}
    </PageScreen>
  );
}

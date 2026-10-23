import { formatRM, sen, type LocalDate } from "@brokely/domain";
import {
  archiveUnsentPlan,
  deleteAllData,
  exportJson,
  getNickname,
  linkedAccount,
  listCategories,
  nextClash,
  phonePlans,
  phoneSummary,
  seedDefaultCategories,
  setNickname,
  signInStep,
  type PlanCard,
  type PlanClash,
  type RecordSummary,
  type SignInStep,
} from "@brokely/local-db";
import type { Session } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { shareExportFile } from "../src/lib/export-file";
import { dayMonth, today } from "../src/lib/today";
import {
  createAccount,
  MIN_PASSWORD,
  resendConfirmation,
  sendPasswordReset,
  signInWithEmail,
  signOutHere,
} from "../src/sync/auth";
import { openEmailApp } from "../src/sync/email-app";
import { googleAvailable, signInWithGoogle } from "../src/sync/google";
import { accountFirstName } from "../src/sync/profile";
import { useSync } from "../src/sync/sync-provider";
import {
  accountHasRecords,
  accountSummary,
  archiveOnServer,
  OfflineError,
  ServerError,
} from "../src/sync/transport";
import { Body, Button, Heading, PageScreen, Sticker } from "../src/ui/components";
import { GoogleButton } from "../src/ui/google-button";
import { Tabs } from "../src/ui/tabs";
import { Appear, Float, TypeText } from "../src/ui/motion";
import { TextField } from "../src/ui/text-field";
import { fonts, MIN_TOUCH, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useToast } from "../src/ui/toast";

type Mode = "sign-in" | "create" | "forgot";
type Phase =
  | { kind: "start" } // S13a
  | { kind: "email" } // S13b
  | { kind: "working"; text: string }
  | { kind: "check-email"; email: string; why: "confirm" | "reset" } // S13c
  | { kind: "ask"; phone: RecordSummary; account: RecordSummary; plans: PlanCard[] } // S13d
  | { kind: "plans"; clash: PlanClash; keep: "account" | "phone"; choices: PlanChoices } // S13l
  | { kind: "other-account" } // S13f
  | { kind: "confirm-erase"; back: Phase }; // S13e

const RESEND_AFTER_S = 60;

/**
 * Answers so far to "Two plans for the same dates" (D-83). Nothing is written until the last
 * answer: then the account's plans are archived on the server first (that can fail), then the
 * phone's.
 */
type PlanChoices = {
  phone: PlanCard[];
  account: PlanCard[];
  /** Plans already settled: they no longer clash. */
  archived: string[];
  onServer: PlanCard[];
  onPhone: string[];
  back: Phase;
};

function lastDay(endExclusive: string): LocalDate {
  const d = new Date(`${endExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) as LocalDate;
}

/** "1 plan · 1 Oct – 30 Nov" and "140 records · 3 debts" (S13d). */
function summaryLines(s: RecordSummary): string[] {
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  const last = s.plans.at(-1);
  const plans = last
    ? `${n(s.plans.length, "plan")} · ${s.plans.length > 1 ? "latest " : ""}${dayMonth(last.start as LocalDate)} – ${dayMonth(lastDay(last.endExclusive))}`
    : "No plan";
  return [plans, `${n(s.records, "record")} · ${n(s.debts, "debt")}`];
}

/**
 * Back up and sync (S13a–S13f; D-72, D-73, D-74). From Welcome ("Already used Brokely?") or
 * from Profile. Google first; email + password behind "Use email instead". After signing in,
 * what happens to this phone's records follows D-73: this account's phone or an empty account →
 * sync; only the first-run setup → replaced by the account's records; both have records → the
 * student chooses with the counts in front of them; another account's phone → never mixed.
 */
export default function SignInScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { session, linked, waiting, sync } = useSync();
  const [phase, setPhase] = useState<Phase>({ kind: "start" });
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [withGoogle, setWithGoogle] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const welcome = from === "welcome";

  useEffect(() => {
    void googleAvailable().then(setWithGoogle);
  }, []);

  // "Resend email (0:42)": counts down once a second while waiting.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /** Where to go once the phone and the account agree. */
  const leave = (backedUp: boolean, firstLink: boolean) => {
    const hasSetup = listCategories(db, { includeArchived: true }).length > 0;
    if (welcome && !hasSetup) {
      seedDefaultCategories(repo); // an account without records: start like a new student (AC-52)
      router.replace("/quick-start");
      return;
    }
    if (welcome) {
      router.replace({
        pathname: "/welcome-back",
        params: { records: String(phoneSummary(db).records) },
      });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/more");
    if (firstLink) {
      toast(
        backedUp ? "You're backed up" : "Signed in · backs up when you're online",
        "cloud-check",
      );
    }
  };

  const finish = async (current: Session) => {
    setPhase({ kind: "working", text: "Bringing your records up to date…" });
    const firstLink = linkedAccount(db) === undefined;
    const report = await sync({ firstLink: true });
    // Brokely calls the student by their first name until they choose a nickname (D-34).
    if (!getNickname(db)) {
      const first = accountFirstName(current);
      if (first) setNickname(repo, first);
    }
    leave(report !== null, firstLink);
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
      if (step === "sync") return await finish(current);
      if (step === "other-account") return setPhase({ kind: "other-account" });
      const account = await accountSummary();
      setPhase({
        kind: "ask",
        phone: phoneSummary(db),
        account: account.summary,
        plans: account.plans,
      });
    } catch (error) {
      setPhase({ kind: "start" });
      setMessage(
        error instanceof OfflineError
          ? "Brokely couldn't reach its server. Check your connection and try again; you're still signed in."
          : error instanceof ServerError
            ? `Brokely's server had a problem (${error.status}). Please try again in a moment; you're still signed in.`
            : "Something went wrong while checking your account. Please try again.",
      );
    }
  };

  /** The next plan question (S13l), or, with every clash settled, the answers applied. */
  const askNext = (choices: PlanChoices) => {
    const clash = nextClash(choices.phone, choices.account, new Set(choices.archived));
    if (clash) return setPhase({ kind: "plans", clash, keep: "account", choices });
    void applyChoices(choices);
  };

  const keepPlan = ({ clash, keep, choices }: Extract<Phase, { kind: "plans" }>) =>
    askNext(
      keep === "account"
        ? {
            ...choices,
            archived: [...choices.archived, clash.phone.id],
            onPhone: [...choices.onPhone, clash.phone.id],
          }
        : {
            ...choices,
            archived: [...choices.archived, ...clash.account.map((a) => a.id)],
            onServer: [...choices.onServer, ...clash.account],
          },
    );

  const applyChoices = async (choices: PlanChoices) => {
    if (!session) return;
    setMessage(null);
    setPhase({ kind: "working", text: "Setting up your plans…" });
    try {
      await archiveOnServer(choices.onServer);
    } catch (error) {
      setPhase(choices.back);
      setMessage(
        error instanceof OfflineError
          ? "Brokely couldn't reach its server. Check your connection and try again."
          : "Your account's plan changed on another phone just now. Please choose again.",
      );
      return;
    }
    for (const id of choices.onPhone) archiveUnsentPlan(repo, id);
    await finish(session);
  };

  // Opened while signed in but not linked yet, e.g. back from the reset link. A sign-in from
  // this screen continues in its own handler (phase "working"), so this never runs twice.
  useEffect(() => {
    if (!session || (phase.kind !== "start" && phase.kind !== "email")) return;
    if (!linked) void afterSignIn(session);
    else leave(true, false);
  }, [session?.user.id]);

  const continueWithGoogle = async () => {
    setMessage(null);
    setPhase({ kind: "working", text: "Signing in with Google…" });
    const result = await signInWithGoogle();
    if (!result.ok) {
      setPhase({ kind: "start" });
      if (!("cancelled" in result)) setMessage(result.message);
      return;
    }
    if (result.session) await afterSignIn(result.session);
    else setPhase({ kind: "start" });
  };

  const submit = async () => {
    setMessage(null);
    if (!email.includes("@")) return setMessage("Please type your email address.");
    if (mode === "forgot") {
      setPhase({ kind: "working", text: "Sending the email…" });
      const sent = await sendPasswordReset(email);
      if (!sent.ok) {
        setPhase({ kind: "email" });
        return setMessage(sent.message);
      }
      setResendIn(RESEND_AFTER_S);
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
      setPhase({ kind: "email" });
      return setMessage(result.message);
    }
    if (!result.session) {
      setResendIn(RESEND_AFTER_S);
      return setPhase({ kind: "check-email", email, why: "confirm" });
    }
    await afterSignIn(result.session);
  };

  const resend = async (current: Extract<Phase, { kind: "check-email" }>) => {
    const sent =
      current.why === "confirm"
        ? await resendConfirmation(current.email)
        : await sendPasswordReset(current.email);
    setMessage(sent.ok ? "Sent again." : sent.message);
    setResendIn(RESEND_AFTER_S);
  };

  const exportFirst = () =>
    void shareExportFile(
      `brokely-data-${today()}.json`,
      "application/json",
      exportJson(db, new Date().toISOString()),
    );

  const eraseAndContinue = async () => {
    if (!session) return;
    deleteAllData(db);
    await finish(session);
  };

  const useAnotherAccount = async () => {
    await signOutHere();
    setPassword("");
    setPhase({ kind: "start" });
  };

  const changeEmail = () => {
    setMessage(null);
    setPhase({ kind: "email" });
  };

  const picture = (height: number) => (
    <Float>
      <Image
        source={require("../assets/mascot/main_design.webp")}
        style={{ width: "100%", height }}
        resizeMode="contain"
        accessibilityLabel="Brokely"
      />
    </Float>
  );

  const notice = message ? (
    <Text
      accessibilityLiveRegion="polite"
      style={[type.strong, { color: colors.text, textAlign: "center" }]}
    >
      {message}
    </Text>
  ) : null;

  return (
    <PageScreen
      title={phase.kind === "confirm-erase" ? "Erase this phone?" : "Back up and sync"}
      keyboardSafe
    >
      {phase.kind === "working" ? (
        <Sticker style={{ padding: space.lg, gap: space.sm, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Body muted>{phase.text}</Body>
        </Sticker>
      ) : null}

      {/* S13a: what an account is for, in Brokely's words. */}
      {phase.kind === "start" ? (
        <>
          {picture(170)}
          <Appear>
            <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
              <TypeText
                text="I'll keep a copy of your plan and records, so a new phone gets everything back."
                perCharMs={22}
                delay={250}
                style={{
                  fontFamily: fonts.heavy,
                  fontSize: 18,
                  lineHeight: 24,
                  color: colors.text,
                  textAlign: "center",
                }}
              />
              <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
                Optional: Brokely works fully without an account.
              </Text>
            </Sticker>
          </Appear>
          {notice}
          <Appear delay={300}>
            <View style={{ gap: space.sm }}>
              {withGoogle ? (
                <>
                  <GoogleButton onPress={() => void continueWithGoogle()} />
                  <View style={{ alignItems: "center" }}>
                    <Button label="Use email instead" variant="link" onPress={changeEmail} />
                  </View>
                </>
              ) : (
                <Button label="Continue with email" onPress={changeEmail} />
              )}
              <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
                No bank login, ever. We back up your records only.
              </Text>
              <AgreeLine action="signing in" />
            </View>
          </Appear>
        </>
      ) : null}

      {/* S13b: tabs show the mode; one password field with Show; a live hint. */}
      {phase.kind === "email" ? (
        <>
          {mode === "forgot" ? (
            <Heading>Reset your password</Heading>
          ) : (
            <Tabs
              tabs={[
                { key: "sign-in", label: "Sign in" },
                { key: "create", label: "Create account" },
              ]}
              value={mode === "create" ? "create" : "sign-in"}
              onChange={(m) => {
                setMode(m);
                setMessage(null);
              }}
            />
          )}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType={mode === "forgot" ? "send" : "next"}
            onSubmitEditing={mode === "forgot" ? () => void submit() : undefined}
          />
          {mode === "forgot" ? null : (
            <TextField
              label={
                mode === "create" ? `Password (at least ${MIN_PASSWORD} characters)` : "Password"
              }
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              textContentType={mode === "create" ? "newPassword" : "password"}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              hint={
                mode === "create" && password.length > 0
                  ? password.length < MIN_PASSWORD
                    ? `${MIN_PASSWORD - password.length} more ${MIN_PASSWORD - password.length === 1 ? "character" : "characters"}`
                    : "Good length ✓"
                  : null
              }
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  onPress={() => setShowPassword((s) => !s)}
                  style={{
                    minHeight: MIN_TOUCH,
                    justifyContent: "center",
                    paddingHorizontal: space.md,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.heavy,
                      fontSize: 14,
                      color: colors.text,
                      textDecorationLine: "underline",
                    }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              }
            />
          )}
          {notice}
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
          {mode === "create" ? (
            <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
              We'll send one email to confirm it's you.
            </Text>
          ) : null}
          {mode === "create" ? <AgreeLine action="creating an account" /> : null}
          {mode === "sign-in" ? (
            <Button label="Forgot password?" variant="link" onPress={() => setMode("forgot")} />
          ) : null}
          {mode === "forgot" ? (
            <Button label="Back to sign in" variant="link" onPress={() => setMode("sign-in")} />
          ) : null}
          {withGoogle ? (
            <Button
              label="Use Google instead"
              variant="link"
              onPress={() => setPhase({ kind: "start" })}
            />
          ) : null}
        </>
      ) : null}

      {/* S13c: open the inbox, resend after 60 s, fix a typo, look in Spam. */}
      {phase.kind === "check-email" ? (
        <>
          {picture(150)}
          <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
            <TypeText
              text="Check your email"
              delay={200}
              style={[
                type.heading,
                { fontSize: 26, lineHeight: 30, color: colors.text, textAlign: "center" },
              ]}
            />
            <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
              {phase.why === "confirm"
                ? `We sent a link to ${phase.email}. Tap it to confirm your account, then come back and sign in.`
                : `If ${phase.email} has an account, we sent it a link to choose a new password.`}
            </Text>
          </Sticker>
          {notice}
          <Button label="Open email app" onPress={() => void openEmailApp()} />
          <Button
            label={
              resendIn > 0
                ? `Resend email (0:${String(resendIn).padStart(2, "0")})`
                : "Resend email"
            }
            variant="secondary"
            disabled={resendIn > 0}
            onPress={() => void resend(phase)}
          />
          <Button label="Wrong address? Change it" variant="link" onPress={changeEmail} />
          <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
            Can't find it? Look in Spam or Promotions.
          </Text>
          {phase.why === "confirm" ? (
            <Button
              label="I've confirmed it: sign in"
              variant="link"
              onPress={() => {
                setMode("sign-in");
                changeEmail();
              }}
            />
          ) : null}
        </>
      ) : null}

      {/* S13d: both sides hold records; show what each holds. */}
      {phase.kind === "ask" ? (
        <>
          <Heading>Your account already has records</Heading>
          <Body muted>This phone has some of its own too. Which do you want to keep using?</Body>
          {[
            { title: "Your account", lines: summaryLines(phase.account), tint: true },
            { title: "This phone", lines: summaryLines(phase.phone), tint: false },
          ].map((side) => (
            <Sticker
              key={side.title}
              background={side.tint ? colors.cardTint : colors.card}
              style={{ padding: space.md, gap: 2 }}
            >
              <Text style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.text }}>
                {side.title}
              </Text>
              {side.lines.map((l) => (
                <Text key={l} style={[type.body, { fontSize: 15, color: colors.muted }]}>
                  {l}
                </Text>
              ))}
            </Sticker>
          ))}
          <Button
            label="Use my account's records"
            onPress={() => setPhase({ kind: "confirm-erase", back: phase })}
          />
          <Button
            label="Add this phone's records"
            variant="secondary"
            onPress={() =>
              askNext({
                phone: phonePlans(db),
                account: phase.plans,
                archived: [],
                onServer: [],
                onPhone: [],
                back: phase,
              })
            }
          />
          <Text style={[type.small, { color: colors.muted }]}>
            Adding keeps both. If a plan has the same dates as one in your account, Brokely asks
            which plan to keep.
          </Text>
          {notice}
        </>
      ) : null}

      {/* S13l: two plans for the same dates; records, bills and debts stay either way (D-83). */}
      {phase.kind === "plans" ? (
        <>
          <Heading>
            Two plans for {dayMonth(phase.clash.phone.start as LocalDate)} –{" "}
            {dayMonth(lastDay(phase.clash.phone.endExclusive))}
          </Heading>
          <Body muted>
            Your account and this phone each have a plan for these dates. Which one should stay?
          </Body>
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            <PlanChoice
              title={
                phase.clash.account.length === 1 ? "Your account's plan" : "Your account's plans"
              }
              plans={phase.clash.account}
              selected={phase.keep === "account"}
              onPress={() => setPhase({ ...phase, keep: "account" })}
            />
            <PlanChoice
              title="This phone's plan"
              plans={[phase.clash.phone]}
              selected={phase.keep === "phone"}
              onPress={() => setPhase({ ...phase, keep: "phone" })}
            />
          </View>
          <Button
            label={phase.keep === "account" ? "Keep my account's plan" : "Keep this phone's plan"}
            onPress={() => keepPlan(phase)}
          />
          <Text style={[type.small, { color: colors.muted }]}>
            All records, bills and debts from both stay either way. Only the other plan's budget and
            amounts are put away.
          </Text>
          <Button label="Back" variant="link" onPress={() => setPhase(phase.choices.back)} />
        </>
      ) : null}

      {/* S13f: another account's records are on this phone; never mixed. */}
      {phase.kind === "other-account" ? (
        <>
          {picture(160)}
          <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
            <Heading>This phone has someone else's records</Heading>
            <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
              They belong to another account. Brokely never mixes two people's money.
            </Text>
          </Sticker>
          <Button label="Sign in with that account" onPress={() => void useAnotherAccount()} />
          <Button
            label="Erase this phone and use this account"
            variant="secondary"
            onPress={() => setPhase({ kind: "confirm-erase", back: phase })}
          />
        </>
      ) : null}

      {/* S13e: export first; the lost-changes count in bold; mustard, never green. */}
      {phase.kind === "confirm-erase" ? (
        <>
          <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
            <Heading>Erase this phone first?</Heading>
            <Body>Everything on this phone is removed, then your account's records come down.</Body>
            {waiting > 0 ? (
              <Text
                style={{
                  fontFamily: fonts.heavy,
                  fontSize: 16,
                  lineHeight: 22,
                  color: colors.text,
                }}
              >
                {waiting} {waiting === 1 ? "change" : "changes"} on this phone{" "}
                {waiting === 1 ? "isn't" : "aren't"} backed up anywhere and will be lost.
              </Text>
            ) : null}
          </Sticker>
          <Button label="Export everything first" variant="secondary" onPress={exportFirst} />
          <Button
            label="Erase and continue"
            variant="destructive"
            onPress={() => void eraseAndContinue()}
          />
          <Button label="Cancel" variant="link" onPress={() => setPhase(phase.back)} />
        </>
      ) : null}
    </PageScreen>
  );
}

/** One side of S13l as a choice card: budget, categories planned, when it was approved. */
function PlanChoice({
  title,
  plans,
  selected,
  onPress,
}: {
  title: string;
  plans: readonly PlanCard[];
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const one = plans.length === 1 ? plans[0]! : null;
  const dates = (p: PlanCard) =>
    `${dayMonth(p.start as LocalDate)} – ${dayMonth(lastDay(p.endExclusive))}`;
  const budget = (p: PlanCard) =>
    p.budgetSen === null ? "No budget yet" : formatRM(sen(p.budgetSen));
  const lines = one
    ? [
        `${one.categories} ${one.categories === 1 ? "category" : "categories"} planned`,
        ...(one.approvedAt
          ? [`Approved ${dayMonth(one.approvedAt.slice(0, 10) as LocalDate)}`]
          : []),
      ]
    : plans.map((p) => `${dates(p)} · ${budget(p)}`);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${one ? `${budget(one)}. ` : ""}${lines.join(". ")}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Sticker
        background={selected ? colors.cardTint : colors.card}
        outline={selected ? colors.primary : colors.outline}
        style={{ padding: space.md, gap: 2, borderWidth: selected ? 3 : 2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 17, color: colors.text }}>
            {title}
          </Text>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: selected ? 7 : 2,
              borderColor: selected ? colors.primary : colors.outline,
              backgroundColor: colors.card,
            }}
          />
        </View>
        {one ? (
          <Text style={[type.heading, { fontSize: 26, lineHeight: 30, color: colors.text }]}>
            {budget(one)}
          </Text>
        ) : null}
        {lines.map((l) => (
          <Text key={l} style={[type.body, { fontSize: 15, color: colors.muted }]}>
            {l}
          </Text>
        ))}
      </Sticker>
    </Pressable>
  );
}

/** Terms and notice before any data leaves the phone (PDPA s.7, D-92, D-93). */
function AgreeLine({ action }: { action: string }) {
  const { colors } = useTheme();
  const link = { color: colors.text, textDecorationLine: "underline" as const };
  return (
    <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
      By {action} you agree to the{" "}
      <Text accessibilityRole="link" onPress={() => router.push("/terms")} style={link}>
        Terms of use
      </Text>{" "}
      and confirm you've read the{" "}
      <Text accessibilityRole="link" onPress={() => router.push("/privacy")} style={link}>
        Privacy notice
      </Text>
      .
    </Text>
  );
}

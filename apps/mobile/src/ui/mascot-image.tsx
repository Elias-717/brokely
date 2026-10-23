import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, Pressable, Text, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { Button, Sticker } from "./components";
import { STAGE_2_DAYS, STAGE_3_DAYS } from "@brokely/domain";
import { STAGE_PICTURES } from "../lib/mascot";
import { grewBuzz } from "./haptics";
import { useReduceMotion } from "./motion";
import { fonts, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * Brokely on Home (D-105, D-109): when the mood or stage changes, the new picture fades in over
 * the old one, so logging visibly wakes a sleepy Brokely. No fade with Reduce motion.
 */
export function MascotImage({
  source,
  label,
  width,
  height,
}: {
  source: ImageSourcePropType;
  label: string;
  width: number;
  height: number;
}) {
  const reduce = useReduceMotion();
  const [previous, setPrevious] = useState<ImageSourcePropType | null>(null);
  const shown = useRef(source);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (shown.current === source) return;
    const old = shown.current;
    shown.current = source;
    if (reduce) return;
    setPrevious(old);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setPrevious(null));
  }, [source, reduce, fade]);

  const style = { width, height };
  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={label}>
      {previous ? (
        <Image source={previous} style={[style, { position: "absolute" }]} resizeMode="contain" />
      ) : null}
      <Animated.Image
        source={source}
        style={[style, { opacity: fade }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const STAGE_WORDS: Record<number, { title: string; body: string }> = {
  2: {
    title: "Brokely grew!",
    body: "7 days logged. Keep going: at 30 days Brokely becomes a full money-broccoli.",
  },
  3: {
    title: "Full money-broccoli!",
    body: "30 days logged. That's a real habit, and Brokely is fully grown.",
  },
};

/**
 * The one-time "Brokely grew" moment (D-109): the new picture pops in with a little bounce and
 * a strong buzz. Shown once per stage; closing it remembers the stage on this phone.
 */
export function GrewCelebration({
  stage,
  picture,
  onClose,
}: {
  stage: number;
  picture: ImageSourcePropType;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0.4)).current;
  const words = STAGE_WORDS[stage] ?? STAGE_WORDS[2]!;

  useEffect(() => {
    grewBuzz();
    if (reduce) return;
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [pop, reduce]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: space.lg,
        }}
      >
        <Pressable onPress={() => undefined}>
          <Sticker style={{ padding: space.lg, gap: space.md, alignItems: "center" }}>
            <Animated.Image
              source={picture}
              style={{ width: 160, height: 200, transform: [{ scale: pop }] }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={`Brokely, stage ${stage} of 3`}
            />
            <Text
              accessibilityRole="header"
              style={{ fontFamily: fonts.heading, fontSize: 28, color: colors.text }}
            >
              {words.title}
            </Text>
            <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
              {words.body}
            </Text>
            <View style={{ alignSelf: "stretch" }}>
              <Button label="Nice!" onPress={onClose} />
            </View>
          </Sticker>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Where each stage starts, in days logged (D-105), and its picture size on the path. */
const STAGES = [
  { from: 0, label: "Start", size: 58 },
  { from: STAGE_2_DAYS, label: `${STAGE_2_DAYS} days`, size: 74 },
  { from: STAGE_3_DAYS, label: `${STAGE_3_DAYS} days`, size: 92 },
] as const;

/** How far along the path the student is: 1/6, 1/2 and 5/6 of the width are the 3 stages. */
function pathProgress(days: number): number {
  if (days >= STAGE_3_DAYS) return 5 / 6;
  if (days >= STAGE_2_DAYS) {
    return 1 / 2 + ((days - STAGE_2_DAYS) / (STAGE_3_DAYS - STAGE_2_DAYS)) * (1 / 3);
  }
  return 1 / 6 + (days / STAGE_2_DAYS) * (1 / 3);
}

/** The line under the path: where the student is and what's next. */
function nextStep(days: number): string {
  const d = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (days >= STAGE_3_DAYS) return `Fully grown! ${d(days)} logged.`;
  const next = days >= STAGE_2_DAYS ? STAGE_3_DAYS : STAGE_2_DAYS;
  const stage = days >= STAGE_2_DAYS ? 3 : 2;
  return `${d(days)} logged · ${d(next - days)} more to stage ${stage}`;
}

/**
 * The one-time "how Brokely grows" card on Profile (D-110), drawn as a growth path (D-120):
 * the three pictures grow from left to right on a numbered track that fills with the days the
 * student has logged; stages not reached yet are faded.
 */
export function GrowIntroCard({ loggedDays, onDone }: { loggedDays: number; onDone: () => void }) {
  const { colors } = useTheme();
  const reached = (i: number) => loggedDays >= STAGES[i]!.from;
  const fill = `${pathProgress(loggedDays) * 100}%` as const;
  return (
    <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Watch Brokely grow
        </Text>
        <Text style={[type.body, { color: colors.text }]}>
          Brokely grows every day you log something, or tap “No spending today”. Log 3 days in a row
          and it looks proud. Spending less never changes it, only the habit does.
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={`Brokely grows in 3 stages: at the start, at ${STAGE_2_DAYS} days logged and at ${STAGE_3_DAYS} days logged. ${nextStep(loggedDays)}`}
        style={{ gap: space.sm }}
      >
        {/* The pictures stand on one line and get bigger, like a plant growing. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          {STAGES.map((s, i) => (
            <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
              <Image
                source={STAGE_PICTURES[i]!}
                style={{ width: s.size, height: s.size * 1.25, opacity: reached(i) ? 1 : 0.4 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
          ))}
        </View>

        {/* The track: filled as far as the student's logged days, a numbered stop per stage. */}
        <View style={{ height: 28, justifyContent: "center" }}>
          <View
            style={{
              position: "absolute",
              left: "16.67%",
              right: "16.67%",
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.background,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: "16.67%",
              width: `${(pathProgress(loggedDays) - 1 / 6) * 100}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.primary,
            }}
          />
          <View style={{ flexDirection: "row" }}>
            {STAGES.map((s, i) => (
              <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: colors.outline,
                    backgroundColor: reached(i) ? colors.primary : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.heavy,
                      fontSize: 14,
                      color: reached(i) ? colors.onPrimary : colors.muted,
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {/* "You" marker where the student is on the track */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: fill,
              marginLeft: -5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.text,
              opacity: loggedDays >= STAGE_3_DAYS ? 0 : 1,
            }}
          />
        </View>

        <View style={{ flexDirection: "row" }}>
          {STAGES.map((s) => (
            <Text
              key={s.label}
              numberOfLines={1}
              style={[type.small, { flex: 1, textAlign: "center", color: colors.muted }]}
            >
              {s.label}
            </Text>
          ))}
        </View>
      </View>

      <View
        style={{
          alignSelf: "center",
          paddingHorizontal: space.md,
          paddingVertical: space.xs,
          borderRadius: 99,
          borderWidth: 2,
          borderColor: colors.outline,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
          {nextStep(loggedDays)}
        </Text>
      </View>

      <Button label="Got it" onPress={onDone} />
    </Sticker>
  );
}

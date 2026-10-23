import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, Pressable, Text, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { Button, Sticker } from "./components";
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

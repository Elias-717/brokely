import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { plain, type Line } from "../lib/brokely-lines";
import { Appear, useReduceMotion } from "./motion";
import { fonts, MIN_TOUCH, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A chat between Brokely and the student (D-33): Brokely on the left with his picture, the
 * student's answers on the right in green. Answers are tapped (big replies) or typed.
 */

const MASCOT = require("../../assets/mascot/main_design.png");

export function BrokelyAvatar({ size }: { size: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: scheme === "dark" ? colors.heroOutline : colors.outline,
        backgroundColor: colors.cardTint,
        overflow: "hidden",
      }}
    >
      {/* The picture is tall (4:5): show the top part, head and face, only slightly zoomed. */}
      <Image
        source={MASCOT}
        accessibilityIgnoresInvertColors
        style={{
          width: size * 1.3,
          height: size * 1.625,
          marginLeft: -size * 0.15,
          marginTop: size * 0.02,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

/** Screen frame: chat header, scrolling messages that stay at the newest, and the reply area. */
export function ChatScreen({
  subtitle,
  onBack,
  onSkip,
  children,
  footer,
}: {
  subtitle: string;
  onBack: () => void;
  /** Shows a "Skip" button at the top right, e.g. to leave planning for later. */
  onSkip?: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            paddingHorizontal: space.sm,
            paddingVertical: space.sm,
            backgroundColor: colors.tabBar,
            borderBottomWidth: 2,
            borderBottomColor: colors.outline,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={{
              width: MIN_TOUCH,
              height: MIN_TOUCH,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Svg width={26} height={26} viewBox="0 0 24 24">
              <Path
                d="M15 5l-7 7 7 7"
                stroke={colors.text}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Pressable>
          <BrokelyAvatar size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[type.heading, { color: colors.text }]}>Brokely</Text>
            <Text style={[type.small, { color: colors.muted }]}>{subtitle}</Text>
          </View>
          {onSkip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip for now"
              onPress={onSkip}
              style={({ pressed }) => ({
                minHeight: MIN_TOUCH,
                paddingHorizontal: space.md,
                justifyContent: "center",
                borderRadius: 12,
                borderWidth: 2,
                borderColor: colors.outline,
                backgroundColor: colors.background,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "flex-end",
            padding: space.md,
            gap: space.sm,
          }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <View
          style={{
            paddingHorizontal: space.md,
            paddingTop: space.md,
            paddingBottom: space.lg,
            gap: space.md,
            backgroundColor: colors.tabBar,
            borderTopWidth: 2,
            borderTopColor: colors.outline,
          }}
        >
          {footer}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RichText({ line, color, size = 16 }: { line: Line; color: string; size?: number }) {
  return (
    <Text style={[type.body, { color, fontSize: size, lineHeight: size * 1.4 }]}>
      {line.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text key={i} style={{ fontFamily: fonts.heavy }}>
            {part.b}
          </Text>
        ),
      )}
    </Text>
  );
}

/** A message from Brokely. `avatar` on the last of a run, like a messaging app. */
export function BrokelyBubble({
  line,
  avatar,
  faded,
}: {
  line: Line;
  avatar?: boolean;
  faded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Appear>
      <View
        accessible
        accessibilityLabel={`Brokely: ${plain(line)}`}
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.sm,
          maxWidth: "88%",
          opacity: faded ? 0.6 : 1,
        }}
      >
        {avatar ? <BrokelyAvatar size={32} /> : <View style={{ width: 32 }} />}
        <View
          style={{
            flexShrink: 1,
            backgroundColor: colors.card,
            borderWidth: 2,
            borderColor: colors.outline,
            borderRadius: 18,
            borderBottomLeftRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <RichText line={line} color={colors.text} />
        </View>
      </View>
    </Appear>
  );
}

/** The student's answer, on the right in green. `big` for an amount. */
export function MyBubble({ text, big }: { text: string; big?: boolean }) {
  const { colors } = useTheme();
  return (
    <Appear>
      <View
        accessible
        accessibilityLabel={`You: ${text}`}
        style={{
          alignSelf: "flex-end",
          maxWidth: "80%",
          backgroundColor: colors.primary,
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          paddingHorizontal: big ? 16 : 14,
          paddingVertical: big ? 6 : 10,
        }}
      >
        <Text
          style={
            big
              ? {
                  fontFamily: fonts.heading,
                  fontSize: 24,
                  color: colors.onPrimary,
                  fontVariant: ["tabular-nums"],
                }
              : [type.strong, { color: colors.onPrimary }]
          }
        >
          {text}
        </Text>
      </View>
    </Appear>
  );
}

/** Three dots while Brokely "types" (skipped when Reduce motion is on). */
export function TypingBubble() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View accessibilityLabel="Brokely is typing" style={{ flexDirection: "row", gap: space.sm }}>
      <View style={{ width: 32 }} />
      <Animated.View
        style={{
          opacity: pulse,
          flexDirection: "row",
          gap: 5,
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: 18,
          borderBottomLeftRadius: 6,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted }}
          />
        ))}
      </Animated.View>
    </View>
  );
}

/** A big tappable reply (D-33: choices are large). */
export function ReplyButton({
  title,
  detail,
  primary,
  onPress,
}: {
  title: string;
  detail?: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = primary ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, marginRight: 3, marginBottom: 3 })}
    >
      <View
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          right: -3,
          bottom: -3,
          borderRadius: 18,
          backgroundColor: colors.shadow,
        }}
      />
      <View
        style={{
          minHeight: detail ? 72 : 60,
          justifyContent: "center",
          gap: 2,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          backgroundColor: primary ? colors.primary : colors.background,
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: fg }}>{title}</Text>
        {detail ? (
          <Text
            style={[type.body, { fontSize: 15, color: primary ? colors.onPrimary : colors.muted }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Message box for an amount, with a round send button. */
export function AmountComposer({
  label,
  onSend,
}: {
  label: string;
  onSend: (text: string) => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const send = () => {
    if (text.trim() === "") return;
    onSend(text);
    setText("");
  };
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            height: 56,
            borderWidth: 2,
            borderColor: colors.primary,
            borderRadius: 28,
            backgroundColor: colors.card,
            paddingHorizontal: 18,
          }}
        >
          <Text style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.muted }}>RM</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            keyboardType="decimal-pad"
            returnKeyType="send"
            autoFocus
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            accessibilityLabel={label}
            style={{
              flex: 1,
              fontFamily: fonts.heading,
              fontSize: 24,
              color: colors.text,
              fontVariant: ["tabular-nums"],
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={send}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M5 12h14M13 6l6 6-6 6"
              stroke={colors.onPrimary}
              strokeWidth={2.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

/** How long Brokely "types" before a message appears, in ms (0 with Reduce motion). */
export function useTypingDelay(): number {
  return useReduceMotion() ? 0 : 650;
}

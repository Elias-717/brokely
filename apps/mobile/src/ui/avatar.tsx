import { useState } from "react";
import { Image, Text, View } from "react-native";
import { fonts } from "./theme";
import { useTheme } from "./theme-context";

/**
 * The student's picture (S13h, S13j, S13k): the account's photo when signed in with Google,
 * otherwise (or if the photo can't load) the first letter of their name on a circle, green when
 * signed in. Decorative: the name next to it is what screen readers read.
 */
export function Avatar({
  size,
  photoUrl,
  name,
  signedIn,
}: {
  size: number;
  photoUrl?: string | null;
  name: string | null;
  signedIn: boolean;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const initial = (name?.trim()[0] ?? "🥦").toUpperCase();
  const offset = 2;
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={{ marginRight: offset, marginBottom: offset }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          circle,
          { position: "absolute", top: offset, left: offset, backgroundColor: colors.shadow },
        ]}
      />
      <View
        style={[
          circle,
          {
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: signedIn ? colors.primary : colors.cardTint,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          },
        ]}
      >
        {photoUrl && !failed ? (
          <Image source={{ uri: photoUrl }} style={circle} onError={() => setFailed(true)} />
        ) : (
          <Text
            style={{
              fontFamily: fonts.heading,
              fontSize: Math.round(size * 0.45),
              color: signedIn ? colors.onPrimary : colors.text,
            }}
          >
            {initial}
          </Text>
        )}
      </View>
    </View>
  );
}

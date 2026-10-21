import { PRIVACY_NOTICE } from "@brokely/contracts";
import { useState } from "react";
import { Text, View } from "react-native";
import { Body, Heading, PageScreen, Sticker } from "../src/ui/components";
import { Segmented } from "../src/ui/segmented";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * Privacy notice (PDPA s.7, D-92): from More → Your data and from the sign-in screen, before
 * any data leaves the phone. The same text as the public page (GET /privacy on the API), in
 * English and Bahasa Malaysia.
 */
export default function PrivacyScreen() {
  const { colors } = useTheme();
  const [lang, setLang] = useState<"en" | "ms">("en");
  const notice = PRIVACY_NOTICE[lang];
  return (
    <PageScreen title={notice.title}>
      <Segmented
        options={[
          { value: "en", label: "English" },
          { value: "ms", label: "Bahasa Malaysia" },
        ]}
        value={lang}
        label="Language"
        onChange={setLang}
      />
      <Text style={[type.small, { color: colors.muted }]}>{notice.updated}</Text>
      {notice.sections.map((s) => (
        <Sticker key={s.title} style={{ padding: space.md, gap: space.xs }}>
          <Heading>{s.title}</Heading>
          {s.paragraphs.map((p) => (
            <Body key={p}>{p}</Body>
          ))}
        </Sticker>
      ))}
      <View style={{ height: space.lg }} />
    </PageScreen>
  );
}

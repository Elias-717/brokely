import type { LegalDocument } from "@brokely/contracts";
import { useState } from "react";
import { Text, View } from "react-native";
import { Body, Heading, PageScreen, Sticker } from "./components";
import { Segmented } from "./segmented";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A legal text in English and Bahasa Malaysia (D-92, D-93): Privacy notice, Terms of use. The
 * same texts as the public pages on the API.
 */
export function LegalDocumentScreen({
  doc,
}: {
  doc: Readonly<Record<"en" | "ms", LegalDocument>>;
}) {
  const { colors } = useTheme();
  const [lang, setLang] = useState<"en" | "ms">("en");
  const text = doc[lang];
  return (
    <PageScreen title={text.title}>
      <Segmented
        options={[
          { value: "en", label: "English" },
          { value: "ms", label: "Bahasa Malaysia" },
        ]}
        value={lang}
        label="Language"
        onChange={setLang}
      />
      <Text style={[type.small, { color: colors.muted }]}>{text.updated}</Text>
      {text.sections.map((s) => (
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

import { suggestionNotes } from "@brokely/domain";
import {
  getNoteSuggestionPrefs,
  hideNoteSuggestions,
  setNoteSuggestionsEnabled,
  showNoteSuggestions,
} from "@brokely/local-db";
import { useMemo } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { guessHistory } from "../src/lib/category-order";
import { today } from "../src/lib/today";
import { Button, Empty, PageScreen, Sticker } from "../src/ui/components";
import { fonts, MIN_TOUCH, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

/**
 * More → Note suggestions (D-143): the past notes that drop down while typing in Add (D-112).
 * Remove one with ✕ or all with Clear all (each with Undo), or turn suggestions off. Removing
 * only hides a note from the suggestions; the records keep their notes.
 */
export default function NoteSuggestionsScreen() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const prefs = useRead(getNoteSuggestionPrefs);
  const history = useRead((db) => guessHistory(db, day), [day]);
  const hidden = new Set(prefs.hidden);
  const notes = suggestionNotes(history).filter((n) => !hidden.has(n.key));

  const remove = (keys: string[], message: string) => {
    hideNoteSuggestions(repo, keys);
    showUndo(message, () => showNoteSuggestions(repo, keys));
  };

  return (
    <PageScreen title="Note suggestions">
      <Sticker
        style={{
          minHeight: 64,
          paddingHorizontal: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
            Suggest past notes
          </Text>
          <Text style={[type.small, { color: colors.muted }]}>
            While you type what you spent on in Add
          </Text>
        </View>
        <Switch
          value={prefs.enabled}
          onValueChange={(on) => setNoteSuggestionsEnabled(repo, on)}
          accessibilityLabel="Suggest past notes"
          trackColor={{ true: colors.primary, false: colors.outline }}
        />
      </Sticker>

      {notes.length === 0 ? (
        <Empty>No past notes to suggest yet. They appear as you add spending with a note.</Empty>
      ) : (
        <>
          <Text style={[type.small, { color: colors.muted }]}>
            {notes.length} {notes.length === 1 ? "note" : "notes"}. Removing one only stops it being
            suggested; your records keep their notes.
          </Text>
          <Sticker style={{ padding: 0 }}>
            {notes.map((n, i) => (
              <View
                key={n.key}
                style={{
                  minHeight: MIN_TOUCH + 4,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingLeft: space.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.background,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.text }}
                >
                  {n.note}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${n.note} from suggestions`}
                  onPress={() => remove([n.key], `Removed “${n.note}”`)}
                  style={({ pressed }) => ({
                    width: MIN_TOUCH,
                    height: MIN_TOUCH,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.muted }}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
          </Sticker>
          <View style={{ marginBottom: space.lg }}>
            <Button
              label="Clear all"
              variant="secondary"
              onPress={() =>
                remove(
                  notes.map((n) => n.key),
                  `Cleared ${notes.length} ${notes.length === 1 ? "suggestion" : "suggestions"}`,
                )
              }
            />
          </View>
        </>
      )}
    </PageScreen>
  );
}

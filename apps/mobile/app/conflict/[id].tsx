import { listCategories, listConflicts, resolveConflict, stuckChanges } from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { db, repo } from "../../src/db/client";
import { conflictRows, type FieldRow } from "../../src/lib/conflict-view";
import { useSync } from "../../src/sync/sync-provider";
import { Body, Button, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useToast } from "../../src/ui/toast";

type Keep = "latest" | "mine";

/**
 * S13m Changed on two phones (FR-SYNC-08, AC-21): opened from Backup → Needs a look. Both
 * versions side by side with the fields that differ marked; nothing is lost until the student
 * chooses. The latest is picked by default. "Use mine" sends this phone's change again on top
 * of the latest, so every phone gets it; "Keep the latest" drops it.
 */
export default function ConflictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const sync = useSync();
  const toast = useToast();
  const [keep, setKeep] = useState<Keep>("latest");
  // Read once: after a choice the conflict is gone and the screen is already closing.
  const view = useMemo(() => {
    const conflict = listConflicts(db).find((c) => c.operationId === id);
    if (!conflict) return null;
    const names = new Map(listCategories(db, { includeArchived: true }).map((c) => [c.id, c.name]));
    const stuck = stuckChanges(db).find((s) => s.operationId === id);
    return {
      conflict,
      title: stuck?.label ?? stuck?.kind ?? "A record",
      rows: conflictRows(conflict.mine, conflict.latest, (c) => names.get(c) ?? "Other"),
    };
  }, [id]);
  if (!view) return <Redirect href="/backup" />;
  const { conflict, title, rows } = view;

  const choose = () => {
    if (!resolveConflict(repo, conflict.operationId, keep)) return router.back();
    void sync.sync();
    router.back();
    toast(
      keep === "mine" ? "Your version is backing up" : "Kept the latest version",
      "cloud-check",
    );
  };

  return (
    <PageScreen title="Backup">
      <Heading>{title} changed on two phones</Heading>
      <Body muted>
        Another phone saved a change to this record before this one could back up. Which version
        should stay?
      </Body>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        <Version
          title="Latest version · from another phone"
          deleted={conflict.latest === null ? "Deleted on another phone" : null}
          rows={rows}
          side="latest"
          selected={keep === "latest"}
          onPress={() => setKeep("latest")}
        />
        <Version
          title="Your change on this phone"
          deleted={conflict.mine === null ? "You deleted it on this phone" : null}
          rows={rows}
          side="mine"
          selected={keep === "mine"}
          onPress={() => setKeep("mine")}
        />
      </View>
      <Button label={keep === "latest" ? "Keep the latest" : "Use mine"} onPress={choose} />
      <Text style={[type.small, { color: colors.muted, paddingBottom: space.lg }]}>
        Using yours replaces the latest on every phone. Keeping the latest drops the change you made
        here.
      </Text>
    </PageScreen>
  );
}

/** One version as a choice card: its fields, the ones that differ marked. */
function Version({
  title,
  deleted,
  rows,
  side,
  selected,
  onPress,
}: {
  title: string;
  deleted: string | null;
  rows: readonly FieldRow[];
  side: Keep;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const shown = deleted ? [] : rows.filter((r) => r[side] !== null);
  const described = deleted ?? shown.map((r) => `${r.label} ${r[side]}`).join(". ");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${described}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Sticker
        background={selected ? colors.cardTint : colors.card}
        outline={selected ? colors.primary : colors.outline}
        style={{ padding: space.md, gap: 4, borderWidth: selected ? 3 : 2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
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
        {deleted ? (
          <Text style={[type.body, { color: colors.text }]}>{deleted}</Text>
        ) : shown.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>Some details changed.</Text>
        ) : (
          shown.map((r, i) => (
            <View
              key={`${r.label}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: r.differs ? colors.warningCard : undefined,
              }}
            >
              <Text style={[type.small, { flex: 1, color: colors.muted }]}>{r.label}</Text>
              <Text
                numberOfLines={2}
                style={{
                  flexShrink: 1,
                  textAlign: "right",
                  fontFamily: fonts.heavy,
                  fontSize: 15,
                  color: colors.text,
                }}
              >
                {r[side]}
              </Text>
            </View>
          ))
        )}
      </Sticker>
    </Pressable>
  );
}

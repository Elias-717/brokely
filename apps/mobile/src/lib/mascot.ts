import {
  mascotMood,
  mascotStage,
  type LocalDate,
  type MascotMood,
  type MascotStage,
} from "@brokely/domain";
import { listCheckInDates, listTransactions, type Db } from "@brokely/local-db";
import type { ImageSourcePropType } from "react-native";

/** Metro needs a static require per picture. */
const PICTURES: Record<MascotStage, Record<MascotMood, ImageSourcePropType>> = {
  1: {
    happy: require("../../assets/mascot/brokely_s1_happy.webp"),
    worried: require("../../assets/mascot/brokely_s1_worried.webp"),
    proud: require("../../assets/mascot/brokely_s1_proud.webp"),
    sleepy: require("../../assets/mascot/brokely_s1_sleepy.webp"),
  },
  2: {
    happy: require("../../assets/mascot/brokely_s2_happy.webp"),
    worried: require("../../assets/mascot/brokely_s2_worried.webp"),
    proud: require("../../assets/mascot/brokely_s2_proud.webp"),
    sleepy: require("../../assets/mascot/brokely_s2_sleepy.webp"),
  },
  3: {
    happy: require("../../assets/mascot/brokely_s3_happy.webp"),
    worried: require("../../assets/mascot/brokely_s3_worried.webp"),
    proud: require("../../assets/mascot/brokely_s3_proud.webp"),
    sleepy: require("../../assets/mascot/brokely_s3_sleepy.webp"),
  },
};

const MOOD_WORDS: Record<MascotMood, string> = {
  happy: "happy",
  worried: "a little worried",
  proud: "proud",
  sleepy: "sleepy",
};

/**
 * Brokely on Home (D-105): the stage from days logged (any record or "No spending today"),
 * the mood from those days and the pace. The mascot never changes any number (BR-26).
 */
export function readMascot(db: Db, today: LocalDate, overPace: boolean) {
  const logged = new Set<string>([
    ...listTransactions(db)
      .filter((t) => !t.isEstimate)
      .map((t) => t.localDate),
    ...listCheckInDates(db),
  ]);
  for (const d of logged) if (d > today) logged.delete(d);
  const stage = mascotStage(logged.size);
  const mood = mascotMood({ today, logged, overPace });
  return {
    stage,
    mood,
    picture: PICTURES[stage][mood],
    label: `Brokely, stage ${stage} of 3, ${MOOD_WORDS[mood]}`,
  };
}

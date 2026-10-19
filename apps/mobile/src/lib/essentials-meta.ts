import type { Period } from "@brokely/domain";

/**
 * How each essential card asks its questions (D-35, D-36). Matched by the default category
 * names (D-22); an essential the student added themselves uses the "other" entry.
 *
 * - "often": how often (every day / week / month), then how much each time.
 * - "count": about how many times a month (1/2/3/4+/Not sure), then how much each time.
 * - "bill-or-topup": a monthly bill on a set day, or top-ups as needed (count style).
 */
export interface EssentialMeta {
  readonly emoji: string;
  /** Brokely's opener, e.g. "Let's plan your meals 🍛". */
  readonly intro: string;
  /** The thing it counts, for "about how much each …". */
  readonly unit: string;
  readonly style: "often" | "count" | "bill-or-topup";
  /** For "often": the most likely period, offered first. */
  readonly likely: Period;
}

const META: Record<string, EssentialMeta> = {
  Meals: {
    emoji: "🍛",
    intro: "Let's plan your meals",
    unit: "time",
    style: "often",
    likely: "day",
  },
  "Groceries & toiletries": {
    emoji: "🧴",
    intro: "Groceries and toiletries next",
    unit: "time",
    style: "often",
    likely: "week",
  },
  Laundry: {
    emoji: "🧺",
    intro: "Laundry time. No need to know dates, washes happen when clothes run out.",
    unit: "wash",
    style: "count",
    likely: "month",
  },
  Transport: { emoji: "🚌", intro: "Getting around", unit: "time", style: "often", likely: "day" },
  "Phone & internet": {
    emoji: "📱",
    intro: "Phone and internet",
    unit: "top-up",
    style: "bill-or-topup",
    likely: "month",
  },
  Health: {
    emoji: "💊",
    intro: "Health, just in case",
    unit: "time",
    style: "often",
    likely: "month",
  },
};

const OTHER: EssentialMeta = {
  emoji: "✨",
  intro: "",
  unit: "time",
  style: "often",
  likely: "week",
};

export function essentialMeta(name: string): EssentialMeta {
  return META[name] ?? { ...OTHER, intro: `Let's plan ${name.toLowerCase()}` };
}

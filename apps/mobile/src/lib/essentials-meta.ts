import type { Period } from "@brokely/domain";
import type { IconName } from "../ui/icon-paths";

/**
 * How each essential card asks its questions (D-35, D-36). Matched by the default category
 * names (D-22); an essential the student added themselves uses the "other" entry.
 *
 * - "daily": straight to "about how much a day?" (Meals: everyone eats every day, D-42).
 * - "often": how often (every day / week / month), then how much each time.
 * - "count": about how many times a month (1/2/3/4+/Not sure), then how much each time.
 * - "bill-or-topup": a monthly bill on a set day, or top-ups as needed (count style).
 */
export interface EssentialMeta {
  readonly icon: IconName;
  /** Brokely's opener, e.g. "Let's plan your meals". */
  readonly intro: string;
  /** The thing it counts, for "about how much each …". */
  readonly unit: string;
  readonly style: "daily" | "often" | "count" | "bill-or-topup";
  /** For "often": the most likely period, offered first. */
  readonly likely: Period;
}

const META: Record<string, EssentialMeta> = {
  Meals: {
    icon: "bowl-food",
    intro: "Meals first! A fed brain studies better, so this one comes before everything else.",
    unit: "time",
    style: "daily",
    likely: "day",
  },
  "Home necessities": {
    icon: "basket",
    intro: "Home necessities next: groceries, toiletries, cleaning things",
    unit: "time",
    style: "often",
    likely: "week",
  },
  Laundry: {
    icon: "t-shirt",
    intro: "Laundry time. No need to know dates, washes happen when clothes run out.",
    unit: "wash",
    style: "count",
    likely: "month",
  },
  Transport: { icon: "bus", intro: "Getting around", unit: "time", style: "often", likely: "day" },
  "Phone & internet": {
    icon: "device-mobile",
    intro: "Phone and internet",
    unit: "top-up",
    style: "bill-or-topup",
    likely: "month",
  },
  Health: {
    icon: "first-aid-kit",
    intro: "Health, just in case",
    unit: "time",
    style: "often",
    likely: "month",
  },
};

const OTHER: EssentialMeta = {
  icon: "tag",
  intro: "",
  unit: "time",
  style: "often",
  likely: "week",
};

export function essentialMeta(name: string): EssentialMeta {
  return META[name] ?? { ...OTHER, intro: `Let's plan ${name.toLowerCase()}` };
}

/** An icon for every default category (D-108); the student's own categories get a tag. */
const ICONS: Record<string, IconName> = {
  "Snacks & treats": "cookie",
  "Fun & trips": "airplane-tilt",
  Shopping: "shopping-bag",
  "Gifts & charity": "gift",
  Other: "dots-three-circle",
  Emergency: "lifebuoy",
  Savings: "piggy-bank",
  // Created from bill types (D-57)
  "Housing & Rent": "house",
  Utilities: "lightning",
  "Loans & Debt": "hand-coins",
  Subscriptions: "play-circle",
  Insurance: "shield-check",
  Education: "graduation-cap",
};

export function categoryIcon(name: string): IconName {
  return META[name]?.icon ?? ICONS[name] ?? "tag";
}

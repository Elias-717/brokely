import type { CategoryKind } from "@brokely/domain";
import type { IconName } from "../ui/icon-paths";

/**
 * Kinds of bill the student picks from (D-57, author's list). Each one records Mark paid as
 * spending in a category: an existing default where one matches (Phone & internet, Transport,
 * Health), otherwise a category of the same name, created the first time it is used.
 * "Other Bills" lets the student type their own kind.
 */
export interface BillType {
  readonly name: string;
  readonly icon: IconName;
  /** The spending category it records into. */
  readonly category: string;
  /** Kind for a category created from it. */
  readonly kind: CategoryKind;
}

export const OTHER_BILLS = "Other Bills";

export const BILL_TYPES: readonly BillType[] = [
  { name: "Housing & Rent", icon: "house", category: "Housing & Rent", kind: "essential" },
  { name: "Utilities", icon: "lightning", category: "Utilities", kind: "essential" },
  {
    name: "Phone & Internet",
    icon: "device-mobile",
    category: "Phone & internet",
    kind: "essential",
  },
  { name: "Loans & Debt", icon: "hand-coins", category: "Loans & Debt", kind: "essential" },
  { name: "Subscriptions", icon: "play-circle", category: "Subscriptions", kind: "optional" },
  { name: "Transportation", icon: "bus", category: "Transport", kind: "essential" },
  { name: "Insurance", icon: "shield-check", category: "Insurance", kind: "essential" },
  { name: "Education", icon: "graduation-cap", category: "Education", kind: "essential" },
  { name: "Healthcare", icon: "first-aid-kit", category: "Health", kind: "essential" },
  { name: OTHER_BILLS, icon: "receipt", category: "", kind: "essential" },
];

/** The type a saved bill belongs to, from its category's name; unknown names are "Other Bills". */
export function billTypeOf(categoryName: string): BillType {
  return (
    BILL_TYPES.find((t) => t.category.toLowerCase() === categoryName.toLowerCase()) ??
    BILL_TYPES.find((t) => t.name === OTHER_BILLS)!
  );
}

/**
 * Quick add on an empty Bills page (S6, D-77): the usual ones, one tap to a filled-in form.
 * Name, kind and "monthly" only; never an amount, because prices differ (student plans, promos).
 */
export const BILL_PRESETS: readonly { label: string; icon: IconName; type: string }[] = [
  { label: "Phone plan", icon: "device-mobile", type: "Phone & Internet" },
  { label: "Spotify", icon: "music-notes", type: "Subscriptions" },
  { label: "Netflix", icon: "television", type: "Subscriptions" },
  { label: "Bus pass", icon: "bus", type: "Transportation" },
  { label: "Gym", icon: "barbell", type: "Subscriptions" },
  { label: "Rent", icon: "house", type: "Housing & Rent" },
];

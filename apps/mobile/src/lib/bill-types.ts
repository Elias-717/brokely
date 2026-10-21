import type { CategoryKind } from "@brokely/domain";

/**
 * Kinds of bill the student picks from (D-57, author's list). Each one records Mark paid as
 * spending in a category: an existing default where one matches (Phone & internet, Transport,
 * Health), otherwise a category of the same name, created the first time it is used.
 * "Other Bills" lets the student type their own kind.
 */
export interface BillType {
  readonly name: string;
  readonly emoji: string;
  /** The spending category it records into. */
  readonly category: string;
  /** Kind for a category created from it. */
  readonly kind: CategoryKind;
}

export const OTHER_BILLS = "Other Bills";

export const BILL_TYPES: readonly BillType[] = [
  { name: "Housing & Rent", emoji: "🏠", category: "Housing & Rent", kind: "essential" },
  { name: "Utilities", emoji: "💡", category: "Utilities", kind: "essential" },
  { name: "Phone & Internet", emoji: "📱", category: "Phone & internet", kind: "essential" },
  { name: "Loans & Debt", emoji: "🏦", category: "Loans & Debt", kind: "essential" },
  { name: "Subscriptions", emoji: "📺", category: "Subscriptions", kind: "optional" },
  { name: "Transportation", emoji: "🚌", category: "Transport", kind: "essential" },
  { name: "Insurance", emoji: "🛡️", category: "Insurance", kind: "essential" },
  { name: "Education", emoji: "🎓", category: "Education", kind: "essential" },
  { name: "Healthcare", emoji: "💊", category: "Health", kind: "essential" },
  { name: OTHER_BILLS, emoji: "🧾", category: "", kind: "essential" },
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
export const BILL_PRESETS: readonly { label: string; emoji: string; type: string }[] = [
  { label: "Phone plan", emoji: "📱", type: "Phone & Internet" },
  { label: "Spotify", emoji: "🎧", type: "Subscriptions" },
  { label: "Netflix", emoji: "📺", type: "Subscriptions" },
  { label: "Bus pass", emoji: "🚌", type: "Transportation" },
  { label: "Gym", emoji: "🏋️", type: "Subscriptions" },
  { label: "Rent", emoji: "🏠", type: "Housing & Rent" },
];

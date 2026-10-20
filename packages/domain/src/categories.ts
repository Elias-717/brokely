import type { CategoryKind } from "./plan";

/**
 * Default categories offered on first launch (D-22, FR-CAT-01, AC-52).
 * Students can rename, archive or add their own; used categories are archive-only (BR-28).
 */
export interface DefaultCategory {
  readonly key: string;
  readonly name: string;
  readonly kind: CategoryKind;
  /** Its card asks whether it is a monthly bill on a set day (then it becomes a bill) or paid as
   * needed, like top-ups (D-36). Laundry is never a bill. */
  readonly mayBeBill?: true;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { key: "meals", name: "Meals", kind: "essential" },
  { key: "groceries", name: "Home necessities", kind: "essential" }, // was "Groceries & toiletries" (D-43)
  { key: "laundry", name: "Laundry", kind: "essential" },
  { key: "transport", name: "Transport", kind: "essential" },
  { key: "phone", name: "Phone & internet", kind: "essential", mayBeBill: true },
  { key: "health", name: "Health", kind: "essential" },
  { key: "snacks", name: "Snacks & treats", kind: "optional" },
  { key: "fun", name: "Fun & trips", kind: "optional" },
  { key: "shopping", name: "Shopping", kind: "optional" },
  { key: "gifts", name: "Gifts & charity", kind: "optional" },
  { key: "other", name: "Other", kind: "optional" },
  { key: "emergency", name: "Emergency", kind: "set_aside" },
  { key: "savings", name: "Savings", kind: "set_aside" },
];

/**
 * How careful "Delete all my data" has to be (D-133, FR-ACC-07): the friction follows what would
 * really be lost. Without an account nothing exists anywhere else; with an account, only changes
 * still waiting to sync are lost, and everything else comes back on sign-in.
 */
export type DeleteDataCase = "only-here" | "not-backed-up" | "backed-up";

export function deleteDataCase(state: {
  readonly signedIn: boolean;
  readonly waiting: number;
}): DeleteDataCase {
  if (!state.signedIn) return "only-here";
  return state.waiting > 0 ? "not-backed-up" : "backed-up";
}

/** The word is typed only when something would be lost for good. */
export function needsDeleteWord(deleteCase: DeleteDataCase): boolean {
  return deleteCase !== "backed-up";
}

/** Capitals and spaces around the word don't matter: the point is the pause, not the spelling. */
export function deleteWordTyped(typed: string): boolean {
  return typed.trim().toUpperCase() === "DELETE";
}

export interface DataCounts {
  readonly records: number;
  readonly plans: number;
  readonly debts: number;
  readonly bills: number;
}

/** "143 records, 3 plans, 2 debts and 4 bills"; empty when there is nothing to count. */
export function dataCountsInWords(counts: DataCounts): string {
  const parts = (
    [
      [counts.records, "record"],
      [counts.plans, "plan"],
      [counts.debts, "debt"],
      [counts.bills, "bill"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`);
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

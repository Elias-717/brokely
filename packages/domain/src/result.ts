/**
 * Outcome of a business-rule check. Codes match the sync error codes (docs/design/sync-api.md §6),
 * so the phone and the server reject the same things with the same words.
 */
export type RuleErrorCode =
  | "VALIDATION_FAILED"
  | "LINES_DO_NOT_SUM"
  | "REFUND_EXCEEDS_PURCHASE"
  | "CYCLE_OVERLAP"
  | "REVISION_IMMUTABLE"
  | "DRAFT_REVISION_EXISTS"
  | "SHORTFALL_NOT_ACKNOWLEDGED"
  | "CATEGORY_IN_USE"
  | "DEBT_EXCEEDS_OUTSTANDING";

export type RuleResult = { ok: true } | { ok: false; code: RuleErrorCode; message: string };

export const OK: RuleResult = { ok: true };

export function fail(code: RuleErrorCode, message: string): RuleResult {
  return { ok: false, code, message };
}

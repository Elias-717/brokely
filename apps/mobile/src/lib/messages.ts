import type { RepoErrorCode } from "@brokely/local-db";

/**
 * What the student reads when a save is refused. Fact first, what to do next, no blame
 * (rule 9). Codes without a special line use the repository's own message.
 */
export function refusalText(code: RepoErrorCode, message: string): string {
  if (code === "CYCLE_OVERLAP") {
    return "You already have a plan for some of these dates. Pick dates after it ends.";
  }
  return message;
}

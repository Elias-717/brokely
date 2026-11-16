/**
 * A person's name is a label, not a sentence (D-116). Up to 8 words and 60 characters (D-136,
 * was 4 and 30): TNG shows full names, e.g. "Wan Muhammad Aiman Hakimi bin Wan Ahmad Zulkifli".
 */
export const NAME_MAX_WORDS = 8;
export const NAME_MAX_CHARS = 60;

/** Leading spaces dropped, runs of spaces made one. */
const tidy = (typed: string) => typed.replace(/^\s+/, "").replace(/\s+/g, " ");

/**
 * Keeps what is typed into a name box to at most 8 words and 60 characters, as it is typed:
 * the space that would start a ninth word is not taken, and double spaces become one. One
 * space after a word is kept while there is room for another word, so it can be typed.
 */
export function limitName(typed: string): string {
  const words = tidy(typed).split(" ");
  const kept = words.slice(0, NAME_MAX_WORDS);
  return kept.join(" ").slice(0, NAME_MAX_CHARS);
}

/**
 * Whether the student tried to type more than a name allows, so the box can say
 * "a name, not a sentence" while {@link limitName} keeps the name.
 */
export function nameOverLimit(typed: string): boolean {
  return limitName(typed) !== tidy(typed);
}

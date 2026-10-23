/**
 * A person's name is a short label, not a sentence (D-116): up to 4 words, so full Malaysian
 * names fit ("Tan Wei Ming", "Muhammad Aiman bin Ali").
 */
export const NAME_MAX_WORDS = 4;
export const NAME_MAX_CHARS = 30;

/** Leading spaces dropped, runs of spaces made one. */
const tidy = (typed: string) => typed.replace(/^\s+/, "").replace(/\s+/g, " ");

/**
 * Keeps what is typed into a name box to at most 4 words and 30 characters, as it is typed:
 * the space that would start a fifth word is not taken, and double spaces become one. One
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

/** A person's name is a short label, not a sentence (D-116). */
export const NAME_MAX_WORDS = 2;
export const NAME_MAX_CHARS = 20;

/**
 * Keeps what is typed into a name box to at most 2 words and 20 characters, as it is typed:
 * "Kak Sarah" fits, the space that would start a third word is not taken, and double spaces
 * become one. Leading spaces are dropped; one space after the first word is kept so the
 * second word can be typed.
 */
export function limitName(typed: string): string {
  const words = typed.replace(/^\s+/, "").split(/\s+/);
  const kept = words.slice(0, NAME_MAX_WORDS);
  // A space after the first word (not yet a second word) is kept for typing.
  if (words.length === 2 && words[1] === "") kept[1] = "";
  return kept.join(" ").slice(0, NAME_MAX_CHARS);
}

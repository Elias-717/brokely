/**
 * Smart categorization (D-84): a likely category from the note being typed in quick add. On the
 * phone only, no network, no paid service (NFR-20). It learns from the student's own records
 * first and falls back on a short list of common student words. It is only a suggestion: the
 * student can always pick another category, and a category picked by hand is never replaced.
 */

/** A past record: its note and the category its spending went to. */
export type GuessHistory = readonly { readonly note: string; readonly categoryId: string }[];

export interface CategoryGuess {
  readonly categoryId: string;
  /** `history`: the student's own records; `starter`: the common-words list. */
  readonly source: "history" | "starter";
  /** The note or word the guess came from, e.g. "nasi lemak". */
  readonly matched: string;
}

/** Lower case, letters and digits only, single spaces: "Teh-tarik!!" → "teh tarik". */
export function normalizeNote(note: string): string {
  return note
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words too common to say anything about a category. */
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "dan", "untuk", "kat"]);

/** A word belongs to a category when at least this share of its uses went there. */
const WORD_AGREEMENT = 0.75;

/**
 * Common student words → default category name (D-22, D-43). Whole words or phrases only.
 * TNG reloads are transfers between the student's own wallets, so "reload" and "top up" are
 * left out on purpose.
 */
const STARTER_WORDS: Record<string, readonly string[]> = {
  Meals: [
    "nasi lemak",
    "nasi goreng",
    "nasi campur",
    "nasi kandar",
    "chicken rice",
    "mee goreng",
    "roti canai",
    "mamak",
    "makan",
    "lunch",
    "dinner",
    "breakfast",
    "brunch",
    "cafeteria",
    "canteen",
    "kfc",
    "mcd",
    "mcdonalds",
    "food",
    "rice",
  ],
  "Snacks & treats": [
    "teh tarik",
    "teh ais",
    "kopi",
    "coffee",
    "starbucks",
    "bubble tea",
    "boba",
    "milo",
    "snack",
    "snacks",
    "ice cream",
    "chocolate",
    "kuih",
    "cake",
    "chips",
    "dessert",
  ],
  Transport: [
    "grab",
    "bus",
    "lrt",
    "mrt",
    "ktm",
    "train",
    "taxi",
    "petrol",
    "fuel",
    "parking",
    "toll",
    "e hailing",
  ],
  Laundry: ["laundry", "dobi", "wash", "washing", "dryer"],
  "Phone & internet": [
    "phone bill",
    "data plan",
    "prepaid",
    "postpaid",
    "internet",
    "wifi",
    "unifi",
    "hotspot",
    "celcom",
    "maxis",
    "digi",
    "umobile",
    "hotlink",
  ],
  "Home necessities": [
    "groceries",
    "grocery",
    "toiletries",
    "shampoo",
    "soap",
    "toothpaste",
    "detergent",
    "tissue",
    "mydin",
    "lotus",
    "speedmart",
  ],
  Health: ["clinic", "doctor", "pharmacy", "medicine", "panadol", "dentist", "vitamins"],
  "Fun & trips": ["movie", "cinema", "gsc", "tgv", "trip", "bowling", "karaoke", "concert"],
  Shopping: ["shopee", "lazada", "clothes", "shoes", "shirt", "uniqlo"],
  "Gifts & charity": ["gift", "present", "donation", "sedekah", "charity"],
};

/** Phrases longest first, so "nasi lemak" wins over "rice" and "teh tarik" over a lone word. */
const STARTER_PHRASES = Object.entries(STARTER_WORDS)
  .flatMap(([category, phrases]) => phrases.map((phrase) => ({ phrase, category })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const hasWord = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/** The category most of these votes went to, if it is a clear winner. */
function clearWinner(votes: readonly string[], share: number): string | null {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top, second] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!top || (second && second[1] === top[1])) return null;
  return top[1] / votes.length >= share ? top[0] : null;
}

/**
 * The likely category for a note, or null when there is no good guess:
 * 1. the same note before → the category it went to most;
 * 2. a word the student always (≥ 75%) filed under one category → that one;
 * 3. a common student word → its default category, when the student still has it.
 * Only `categories` (the student's live categories) are ever suggested.
 */
export function guessCategory(
  note: string,
  history: GuessHistory,
  categories: readonly { readonly id: string; readonly name: string }[],
): CategoryGuess | null {
  const text = normalizeNote(note);
  if (!text) return null;
  const live = new Set(categories.map((c) => c.id));
  const past = history
    .filter((h) => live.has(h.categoryId))
    .map((h) => ({ text: normalizeNote(h.note), categoryId: h.categoryId }))
    .filter((h) => h.text);

  // 1. The same note.
  const same = clearWinner(
    past.filter((h) => h.text === text).map((h) => h.categoryId),
    0,
  );
  if (same) return { categoryId: same, source: "history", matched: text };

  // 2. The student's own words: the word with the most uses that all point one way.
  let best: { word: string; categoryId: string; uses: number } | null = null;
  for (const word of new Set(text.split(" "))) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    const votes = past.filter((h) => hasWord(h.text, word)).map((h) => h.categoryId);
    const winner = clearWinner(votes, WORD_AGREEMENT);
    if (winner && (!best || votes.length > best.uses)) {
      best = { word, categoryId: winner, uses: votes.length };
    }
  }
  if (best) return { categoryId: best.categoryId, source: "history", matched: best.word };

  // 3. Common student words.
  for (const { phrase, category } of STARTER_PHRASES) {
    if (!hasWord(text, phrase)) continue;
    const found = categories.find((c) => c.name.toLowerCase() === category.toLowerCase());
    if (found) return { categoryId: found.id, source: "starter", matched: phrase };
  }
  return null;
}

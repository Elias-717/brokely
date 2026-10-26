import { parseAmount, type Sen } from "./money";

/**
 * Reads a Touch 'n Go notification on the phone (FR-IMP-03, D-02, D-128). Pure: it only looks at
 * the title and text it is given. It reads exactly the wordings that real notifications have been
 * seen to use, and treats everything else as unreadable, because an amount must never be guessed
 * (FR-IMP-09, AC-36). Promotions and TNG's blank group summaries land in "unreadable" too.
 *
 * Known so far (caught on the author's phone, 26 Oct 2026; no transaction ID in the text or in
 * the hidden fields):
 * - Transfer out: title "Transfer Successful." text "RM 0.06 has been successfully transferred to NAME."
 * - Transfer in:  title "Ka-ching! Incoming Money." text "RM 0.12 received from NAME for Fund Transfer."
 *
 * Not sampled yet, so deliberately unreadable: QR merchant payment, top-up, refund, bill payment.
 * Add each one only from a real sample, with a test.
 */
export type TngParse =
  /** Money moved to or from a person. The student must choose what it is (FR-IMP-08, AC-35). */
  | {
      readonly kind: "person_transfer";
      readonly direction: "out" | "in";
      readonly amount: Sen;
      readonly counterparty: string;
    }
  /** Not a payment Brokely understands: ignore it, or keep it pending with no amount. */
  | { readonly kind: "unreadable" };

/** What the listener captured. `bigText` is used when `text` is empty. */
export interface TngNotificationText {
  readonly title: string;
  readonly text: string;
  readonly bigText?: string;
}

const UNREADABLE: TngParse = { kind: "unreadable" };

/** An amount as TNG writes it: "RM 0.06", "RM1,234.50"; always two decimals. */
const AMOUNT = String.raw`RM ?(\d[\d,]*\.\d{2})`;

const TRANSFER_OUT_TEXT = new RegExp(
  `^${AMOUNT} has been successfully transferred to (.+)\\.$`,
  "i",
);
const TRANSFER_IN_TEXT = new RegExp(`^${AMOUNT} received from (.+) for Fund Transfer\\.$`, "i");

/** Trims, turns non-breaking and repeated spaces into single spaces. */
function tidy(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function amountOf(raw: string | undefined): Sen | null {
  const amount = raw === undefined ? null : parseAmount(raw);
  return amount !== null && amount > 0 ? amount : null;
}

export function parseTngNotification(notification: TngNotificationText): TngParse {
  const title = tidy(notification.title).toLowerCase();
  const text = tidy(notification.text) || tidy(notification.bigText);

  if (title === "transfer successful.") {
    const match = TRANSFER_OUT_TEXT.exec(text);
    return transfer("out", match?.[1], match?.[2]);
  }
  if (title === "ka-ching! incoming money.") {
    const match = TRANSFER_IN_TEXT.exec(text);
    return transfer("in", match?.[1], match?.[2]);
  }
  return UNREADABLE;
}

function transfer(direction: "out" | "in", rawAmount?: string, rawName?: string): TngParse {
  const amount = amountOf(rawAmount);
  const counterparty = tidy(rawName);
  if (amount === null || counterparty === "") return UNREADABLE;
  return { kind: "person_transfer", direction, amount, counterparty };
}

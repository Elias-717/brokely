import { parseAmount, type Sen } from "./money";

/**
 * Reads a Touch 'n Go notification on the phone (FR-IMP-03, D-02, D-128). Pure: it only looks at
 * the title and text it is given. It reads exactly the wordings that real notifications have been
 * seen to use, and treats everything else as unreadable, because an amount must never be guessed
 * (FR-IMP-09, AC-36). Promotions and TNG's blank group summaries land in "unreadable" too.
 *
 * Known so far (caught on the author's phone; transfers carry no transaction ID in the text or
 * in the hidden fields):
 * - Transfer out (26 Oct): title "Transfer Successful." text "RM 0.06 has been successfully
 *   transferred to NAME."
 * - Transfer in (26 Oct): title "Ka-ching! Incoming Money." text "RM 0.12 received from NAME for
 *   Fund Transfer."
 * - Transfer in, second wording (17 Nov): title "You’ve received money!" text "NAME has
 *   transferred RM 1.52 to you. Tap here to check the transaction details."
 * - Reload (17 Nov): title "Reload Successful" text "Your money is in! RM42.00 has been reloaded
 *   to your Touch 'n Go eWallet balance. Reference No. <digits>". The student's own money moving
 *   into TNG: never spending and never money in, so it is recognised and left out.
 * - Mobile prepaid top up (17 Nov): title "Mobile prepaid top up" text "RM5.00 deducted from
 *   your TNG eWallet. If you did not receive your top up within 30 minutes, please call …".
 *   Spending; Phone & internet is suggested, the student confirms (D-02).
 * - Points (17 Nov): title "You've just earned 5 points!", posted with a payment (half a second
 *   after the top up). Recognised and left out: the payment's own notification carries the amount.
 *
 * Not sampled yet, so deliberately unreadable: QR merchant payment, refund, bill payment.
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
  /** Money paid to a business, e.g. a mobile prepaid top up. Spending once confirmed (D-02). */
  | {
      readonly kind: "payment";
      readonly amount: Sen;
      /** What it was, as TNG names it, e.g. "Mobile prepaid top up". */
      readonly description: string;
      /** The default category's name to suggest, or null to let the student choose. */
      readonly categoryHint: string | null;
    }
  /** TNG reward points, posted next to a payment. Never an amount of money. */
  | { readonly kind: "points"; readonly points: number }
  /** A top-up from the student's own bank or card: own money moving, so it counts for nothing. */
  | { readonly kind: "reload"; readonly amount: Sen; readonly reference: string | null }
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
const RECEIVED_TEXT = new RegExp(
  `^(.+) has transferred ${AMOUNT} to you\\.(?: Tap here to check the transaction details\\.)?$`,
  "i",
);
const RELOAD_TEXT = new RegExp(
  `^Your money is in! ${AMOUNT} has been reloaded to your Touch 'n Go eWallet balance\\.(?: Reference No\\. (\\w+))?$`,
  "i",
);

const PREPAID_TEXT = new RegExp(`^${AMOUNT} deducted from your TNG eWallet\\.`, "i");
const POINTS_TITLE = /^you've just earned (\d+) points?!$/;

/** Trims, turns non-breaking and repeated spaces into one space, and curly quotes into '. */
function tidy(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim();
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
  if (title === "you've received money!") {
    const match = RECEIVED_TEXT.exec(text);
    return transfer("in", match?.[2], match?.[1]);
  }
  if (title === "reload successful") {
    const match = RELOAD_TEXT.exec(text);
    const amount = amountOf(match?.[1]);
    if (amount === null) return UNREADABLE;
    return { kind: "reload", amount, reference: match?.[2] ?? null };
  }
  if (title === "mobile prepaid top up") {
    const amount = amountOf(PREPAID_TEXT.exec(text)?.[1]);
    if (amount === null) return UNREADABLE;
    return {
      kind: "payment",
      amount,
      description: "Mobile prepaid top up",
      categoryHint: "Phone & internet",
    };
  }
  const points = POINTS_TITLE.exec(title);
  if (points) return { kind: "points", points: Number(points[1]) };
  return UNREADABLE;
}

function transfer(direction: "out" | "in", rawAmount?: string, rawName?: string): TngParse {
  const amount = amountOf(rawAmount);
  const counterparty = tidy(rawName);
  if (amount === null || counterparty === "") return UNREADABLE;
  return { kind: "person_transfer", direction, amount, counterparty };
}

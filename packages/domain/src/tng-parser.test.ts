import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { parseTngNotification } from "./tng-parser";

/**
 * Fixtures copy the wording of real TNG notifications caught on the author's phone on 26 Oct
 * 2026 (D-128); the person's name is replaced by [FRIEND A] (rule 7: public repo, private data).
 * Only transfer out and transfer in are sampled so far. QR payment, top-up, refund and bill
 * payments are NOT covered yet: they must stay unreadable until a real sample exists (FR-IMP-09).
 */
const TRANSFER_OUT = {
  title: "Transfer Successful.",
  text: "RM 0.06 has been successfully transferred to [FRIEND A].",
};
const TRANSFER_IN = {
  title: "Ka-ching! Incoming Money.",
  text: "RM 0.12 received from [FRIEND A] for Fund Transfer.",
};

describe("parseTngNotification: person transfers (FR-IMP-03, FR-IMP-08, AC-35)", () => {
  it("reads a transfer out as a person transfer, never as spending", () => {
    expect(parseTngNotification(TRANSFER_OUT)).toEqual({
      kind: "person_transfer",
      direction: "out",
      amount: sen(6),
      counterparty: "[FRIEND A]",
    });
  });

  it("reads a transfer in", () => {
    expect(parseTngNotification(TRANSFER_IN)).toEqual({
      kind: "person_transfer",
      direction: "in",
      amount: sen(12),
      counterparty: "[FRIEND A]",
    });
  });

  it("keeps full stops inside a name", () => {
    const parsed = parseTngNotification({
      title: TRANSFER_OUT.title,
      text: "RM 5.00 has been successfully transferred to [FRIEND A. B.].",
    });
    expect(parsed).toMatchObject({ counterparty: "[FRIEND A. B.]", amount: sen(500) });
  });

  it("reads amounts with thousands commas or without a space (format not sampled yet)", () => {
    const big = parseTngNotification({
      title: TRANSFER_IN.title,
      text: "RM 1,234.50 received from [FRIEND A] for Fund Transfer.",
    });
    expect(big).toMatchObject({ amount: sen(123450) });
    const plain = parseTngNotification({
      title: TRANSFER_IN.title,
      text: "RM1234.50 received from [FRIEND A] for Fund Transfer.",
    });
    expect(plain).toMatchObject({ amount: sen(123450) });
  });

  it("is exact in sen, with no floating-point drift (BR-01)", () => {
    const parsed = parseTngNotification({
      title: TRANSFER_IN.title,
      text: "RM 0.29 received from [FRIEND A] for Fund Transfer.",
    });
    expect(parsed).toMatchObject({ amount: sen(29) });
  });

  it("falls back to the big text when the short text is empty", () => {
    expect(
      parseTngNotification({ ...TRANSFER_OUT, text: "", bigText: TRANSFER_OUT.text }),
    ).toMatchObject({
      amount: sen(6),
    });
  });

  it("copes with non-breaking and doubled spaces", () => {
    const parsed = parseTngNotification({
      title: " Transfer Successful. ",
      text: "RM 0.06  has been successfully transferred to [FRIEND A].",
    });
    expect(parsed).toMatchObject({ direction: "out", amount: sen(6) });
  });
});

describe("parseTngNotification: everything else is unreadable (FR-IMP-09, AC-36)", () => {
  it("ignores the blank group summary TNG posts", () => {
    expect(parseTngNotification({ title: "", text: "" })).toEqual({ kind: "unreadable" });
  });

  it("ignores a promotion, even though it is from TNG", () => {
    expect(
      parseTngNotification({
        title: "Your eWallet balance is low. Reload now!",
        text: "Psst... Why not cash in to GO+ for a hassle-free eWallet experience while earning daily returns?",
      }),
    ).toEqual({ kind: "unreadable" });
  });

  it("never guesses an amount from unknown wording", () => {
    expect(
      parseTngNotification({ title: "Something new.", text: "RM 8.50 was moved somewhere." }),
    ).toEqual({ kind: "unreadable" });
  });

  it("needs the known title and the known sentence together", () => {
    expect(parseTngNotification({ title: "Hello!", text: TRANSFER_OUT.text })).toEqual({
      kind: "unreadable",
    });
    expect(parseTngNotification({ title: TRANSFER_OUT.title, text: "RM 0.06 was sent." })).toEqual({
      kind: "unreadable",
    });
  });

  it("refuses a zero amount, three decimals or a missing name", () => {
    for (const text of [
      "RM 0.00 has been successfully transferred to [FRIEND A].",
      "RM 0.123 has been successfully transferred to [FRIEND A].",
      "RM 0.06 has been successfully transferred to .",
    ]) {
      expect(parseTngNotification({ title: TRANSFER_OUT.title, text })).toEqual({
        kind: "unreadable",
      });
    }
  });
});

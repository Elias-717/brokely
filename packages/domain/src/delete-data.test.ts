import { describe, expect, it } from "vitest";
import { dataCountsInWords, deleteDataCase, deleteWordTyped, needsDeleteWord } from "./delete-data";

describe("how careful Delete all my data is (D-133, FR-ACC-07)", () => {
  it("not signed in: nothing exists anywhere else, even with no changes waiting", () => {
    expect(deleteDataCase({ signedIn: false, waiting: 0 })).toBe("only-here");
    expect(deleteDataCase({ signedIn: false, waiting: 12 })).toBe("only-here");
  });

  it("signed in: changes waiting to sync would be lost", () => {
    expect(deleteDataCase({ signedIn: true, waiting: 3 })).toBe("not-backed-up");
  });

  it("signed in with everything backed up: it all comes back on sign-in", () => {
    expect(deleteDataCase({ signedIn: true, waiting: 0 })).toBe("backed-up");
  });

  it("always asks for the typed word, even when everything is backed up (D-135)", () => {
    expect(needsDeleteWord()).toBe(true);
  });
});

describe("the typed word (D-133)", () => {
  it("ignores capitals and spaces around it", () => {
    for (const typed of ["DELETE", "delete", "Delete", " delete "]) {
      expect(deleteWordTyped(typed)).toBe(true);
    }
  });

  it("accepts nothing else", () => {
    for (const typed of ["", "DEL", "DELETED", "DE LETE", "yes"]) {
      expect(deleteWordTyped(typed)).toBe(false);
    }
  });
});

describe("what would go, in words (D-133)", () => {
  const none = { records: 0, plans: 0, debts: 0, bills: 0 };

  it("lists every kind with exact counts", () => {
    expect(dataCountsInWords({ records: 143, plans: 3, debts: 2, bills: 4 })).toBe(
      "143 records, 3 plans, 2 debts and 4 bills",
    );
  });

  it("uses the singular and skips kinds with none", () => {
    expect(dataCountsInWords({ ...none, records: 1, bills: 1 })).toBe("1 record and 1 bill");
    expect(dataCountsInWords({ ...none, plans: 1 })).toBe("1 plan");
  });

  it("is empty when there is nothing to count", () => {
    expect(dataCountsInWords(none)).toBe("");
  });
});

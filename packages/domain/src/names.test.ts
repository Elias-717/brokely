import { describe, expect, it } from "vitest";
import { limitName, nameOverLimit } from "./names";

describe("names are at most 8 words and 60 characters (D-116, D-136)", () => {
  it("keeps full Malaysian names as typed, as TNG shows them", () => {
    expect(limitName("Aiman")).toBe("Aiman");
    expect(limitName("Aiman ")).toBe("Aiman ");
    expect(limitName("Tan Wei Ming")).toBe("Tan Wei Ming");
    expect(limitName("Muhammad Aiman bin Ali")).toBe("Muhammad Aiman bin Ali");
    const tng = "Wan Muhammad Aiman Hakimi bin Wan Ahmad Zulkifli";
    expect(limitName(tng)).toBe(tng);
    expect(nameOverLimit(tng)).toBe(false);
  });

  it("stops at the eighth word: the space for a ninth is not taken, and that is flagged", () => {
    const eight = "Wan Muhammad Aiman Hakimi bin Wan Ahmad Zulkifli";
    expect(limitName(`${eight} `)).toBe(eight);
    expect(nameOverLimit(`${eight} `)).toBe(true);
    expect(limitName("my friend from class who paid for the food last week")).toBe(
      "my friend from class who paid for the",
    );
    expect(nameOverLimit("my friend from class who paid for the food last week")).toBe(true);
  });

  it("drops leading and double spaces without flagging them, and cuts at 60 characters", () => {
    expect(limitName("  Ali")).toBe("Ali");
    expect(limitName("Ali   Baba")).toBe("Ali Baba");
    expect(nameOverLimit("Ali   Baba")).toBe(false);
    const long = "Abdulrahmanabdullahismail Syahrulnizamshahbinmohdkamarulzaman";
    expect(limitName(long)).toHaveLength(60);
    expect(nameOverLimit(long)).toBe(true);
  });
});

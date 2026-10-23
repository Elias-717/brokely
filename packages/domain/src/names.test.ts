import { describe, expect, it } from "vitest";
import { limitName, nameOverLimit } from "./names";

describe("names are at most 4 words and 30 characters (D-116)", () => {
  it("keeps full Malaysian names as typed", () => {
    expect(limitName("Aiman")).toBe("Aiman");
    expect(limitName("Aiman ")).toBe("Aiman ");
    expect(limitName("Tan Wei Ming")).toBe("Tan Wei Ming");
    expect(limitName("Muhammad Aiman bin Ali")).toBe("Muhammad Aiman bin Ali");
    expect(nameOverLimit("Muhammad Aiman bin Ali")).toBe(false);
  });

  it("stops at the fourth word: the space for a fifth is not taken, and that is flagged", () => {
    expect(limitName("Muhammad Aiman bin Ali ")).toBe("Muhammad Aiman bin Ali");
    expect(nameOverLimit("Muhammad Aiman bin Ali ")).toBe(true);
    expect(limitName("my friend from class who paid")).toBe("my friend from class");
    expect(nameOverLimit("my friend from class who paid")).toBe(true);
  });

  it("drops leading and double spaces without flagging them, and cuts at 30 characters", () => {
    expect(limitName("  Ali")).toBe("Ali");
    expect(limitName("Ali   Baba")).toBe("Ali Baba");
    expect(nameOverLimit("Ali   Baba")).toBe(false);
    const long = "Abdulrahmanabdullah Ismailsyahrul";
    expect(limitName(long)).toHaveLength(30);
    expect(nameOverLimit(long)).toBe(true);
  });
});

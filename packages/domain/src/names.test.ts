import { describe, expect, it } from "vitest";
import { limitName } from "./names";

describe("names are at most 2 words and 20 characters (D-116)", () => {
  it("keeps one or two words as typed", () => {
    expect(limitName("Aiman")).toBe("Aiman");
    expect(limitName("Aiman ")).toBe("Aiman ");
    expect(limitName("Kak Sarah")).toBe("Kak Sarah");
  });

  it("stops at the second word: the space for a third is not taken", () => {
    expect(limitName("Kak Sarah ")).toBe("Kak Sarah");
    expect(limitName("my friend from class")).toBe("my friend");
    expect(limitName("Muhammad Aiman bin Ali")).toBe("Muhammad Aiman");
  });

  it("drops leading and double spaces, and cuts at 20 characters", () => {
    expect(limitName("  Ali")).toBe("Ali");
    expect(limitName("Ali   Baba")).toBe("Ali Baba");
    expect(limitName("Abdulrahmanabdullah Ismail")).toBe("Abdulrahmanabdullah ");
    expect(limitName("Abdulrahmanabdullah Ismail").length).toBe(20);
  });
});

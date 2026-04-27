import { describe, it, expect } from "vitest";
import {
  getInitials,
  extractGymName,
} from "./utils";

describe("getInitials", () => {
  it("returns two-letter initials from full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns single letter for single name", () => {
    expect(getInitials("John")).toBe("J");
  });

  it("truncates to 2 characters for 3+ names", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("jane doe")).toBe("JD");
  });
});

describe("extractGymName", () => {
  it("extracts name from FK join object (to-one)", () => {
    expect(extractGymName({ name: "Gracie Barra" })).toBe("Gracie Barra");
  });

  it("extracts name from FK join array (legacy)", () => {
    expect(extractGymName([{ name: "Gracie Barra" }])).toBe("Gracie Barra");
  });

  it("returns null for null input", () => {
    expect(extractGymName(null)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractGymName([])).toBeNull();
  });
});

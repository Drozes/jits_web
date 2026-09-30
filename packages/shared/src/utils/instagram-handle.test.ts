import { describe, expect, it } from "vitest";
import {
  formatInstagramHandle,
  isValidInstagramHandle,
  isValidInstagramInput,
  normalizeInstagramHandle,
} from "./instagram-handle";

// Mirrors normalize_instagram_handle / is_valid_instagram_handle in jr_be
// 20260930165000_athletes_instagram_handle.sql.
describe("normalizeInstagramHandle", () => {
  it("trims, strips leading @s and lowercases", () => {
    expect(normalizeInstagramHandle("  @@Marcus.Reyes ")).toBe("marcus.reyes");
  });

  it("turns blank, whitespace and a bare @ into null", () => {
    expect(normalizeInstagramHandle("")).toBeNull();
    expect(normalizeInstagramHandle("   ")).toBeNull();
    expect(normalizeInstagramHandle("@")).toBeNull();
    expect(normalizeInstagramHandle(null)).toBeNull();
    expect(normalizeInstagramHandle(undefined)).toBeNull();
  });

  it("only strips @ at the start", () => {
    expect(normalizeInstagramHandle("a@b")).toBe("a@b");
  });
});

describe("isValidInstagramHandle", () => {
  it("accepts null and well-formed handles", () => {
    expect(isValidInstagramHandle(null)).toBe(true);
    expect(isValidInstagramHandle("atos_austin")).toBe(true);
    expect(isValidInstagramHandle("a.b_c9")).toBe(true);
    expect(isValidInstagramHandle("a".repeat(30))).toBe(true);
  });

  it("rejects over 30 chars, bad characters and bad dots", () => {
    expect(isValidInstagramHandle("a".repeat(31))).toBe(false);
    expect(isValidInstagramHandle("a-b")).toBe(false);
    expect(isValidInstagramHandle("a b")).toBe(false);
    expect(isValidInstagramHandle("a@b")).toBe(false);
    expect(isValidInstagramHandle(".ab")).toBe(false);
    expect(isValidInstagramHandle("ab.")).toBe(false);
    expect(isValidInstagramHandle("a..b")).toBe(false);
  });
});

describe("isValidInstagramInput", () => {
  it("validates the normalized form, so @ and case are fine and blank is valid", () => {
    expect(isValidInstagramInput("@Marcus")).toBe(true);
    expect(isValidInstagramInput("")).toBe(true);
    expect(isValidInstagramInput("@ marcus")).toBe(false);
    expect(isValidInstagramInput("@" + "a".repeat(30))).toBe(true);
  });
});

describe("formatInstagramHandle", () => {
  it("prefixes @ and renders null as empty", () => {
    expect(formatInstagramHandle("marcus")).toBe("@marcus");
    expect(formatInstagramHandle(null)).toBe("");
  });
});

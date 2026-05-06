/**
 * Tests for session weight validation helpers used in the join wizard's
 * weight step.
 *
 * Source: apps/mobile/lib/session/validate-weight.ts
 */

import {
  isValidWeight,
  parseWeight,
  MIN_WEIGHT_LBS,
  MAX_WEIGHT_LBS,
} from "@/lib/session/validate-weight";

describe("weight validation constants", () => {
  it("MIN_WEIGHT_LBS is 50", () => {
    expect(MIN_WEIGHT_LBS).toBe(50);
  });

  it("MAX_WEIGHT_LBS is 400", () => {
    expect(MAX_WEIGHT_LBS).toBe(400);
  });
});

describe("isValidWeight", () => {
  describe("valid weights", () => {
    it("accepts the minimum weight (50 lbs)", () => {
      expect(isValidWeight("50")).toBe(true);
    });

    it("accepts the maximum weight (400 lbs)", () => {
      expect(isValidWeight("400")).toBe(true);
    });

    it("accepts a typical weight", () => {
      expect(isValidWeight("175")).toBe(true);
    });

    it("accepts decimal weights", () => {
      expect(isValidWeight("155.5")).toBe(true);
    });

    it("accepts weight just above minimum", () => {
      expect(isValidWeight("50.1")).toBe(true);
    });

    it("accepts weight just below maximum", () => {
      expect(isValidWeight("399.9")).toBe(true);
    });
  });

  describe("invalid weights", () => {
    it("rejects weight below minimum", () => {
      expect(isValidWeight("49")).toBe(false);
      expect(isValidWeight("49.9")).toBe(false);
    });

    it("rejects weight above maximum", () => {
      expect(isValidWeight("401")).toBe(false);
      expect(isValidWeight("400.1")).toBe(false);
    });

    it("rejects zero", () => {
      expect(isValidWeight("0")).toBe(false);
    });

    it("rejects negative numbers", () => {
      expect(isValidWeight("-100")).toBe(false);
    });

    it("rejects non-numeric strings", () => {
      expect(isValidWeight("abc")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidWeight("")).toBe(false);
    });

    it("rejects whitespace-only string", () => {
      expect(isValidWeight("   ")).toBe(false);
    });
  });
});

describe("parseWeight", () => {
  it("parses a valid integer string", () => {
    expect(parseWeight("175")).toBe(175);
  });

  it("parses a valid decimal string", () => {
    expect(parseWeight("155.5")).toBe(155.5);
  });

  it("parses zero", () => {
    expect(parseWeight("0")).toBe(0);
  });

  it("parses negative numbers (no range check)", () => {
    // parseWeight only converts; it does not enforce range.
    expect(parseWeight("-10")).toBe(-10);
  });

  it("returns null for non-numeric string", () => {
    expect(parseWeight("abc")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWeight("")).toBeNull();
  });

  it("parses strings with leading numbers", () => {
    // parseFloat("123abc") returns 123, so parseWeight follows suit.
    expect(parseWeight("123abc")).toBe(123);
  });
});

/**
 * Tests for parseFinishTime: converts "mm:ss" or plain seconds strings into
 * an integer number of seconds.
 *
 * Source: apps/mobile/lib/match-flow/parse-finish-time.ts
 */

import {
  parseFinishTime,
  isFinishTimeValid,
} from "@/lib/match-flow/parse-finish-time";

describe("parseFinishTime", () => {
  describe("mm:ss format", () => {
    it('parses "1:23" as 83 seconds', () => {
      expect(parseFinishTime("1:23")).toBe(83);
    });

    it('parses "12:09" as 729 seconds', () => {
      expect(parseFinishTime("12:09")).toBe(729);
    });

    it('parses "0:00" as 0 seconds', () => {
      expect(parseFinishTime("0:00")).toBe(0);
    });

    it('parses "0:59" as 59 seconds', () => {
      expect(parseFinishTime("0:59")).toBe(59);
    });

    it('parses "10:00" as 600 seconds', () => {
      expect(parseFinishTime("10:00")).toBe(600);
    });

    it('parses "99:59" as 5999 seconds', () => {
      expect(parseFinishTime("99:59")).toBe(5999);
    });
  });

  describe("plain seconds format", () => {
    it('parses "45" as 45 seconds', () => {
      expect(parseFinishTime("45")).toBe(45);
    });

    it('parses "0" as 0 seconds', () => {
      expect(parseFinishTime("0")).toBe(0);
    });

    it('parses "600" as 600 seconds', () => {
      expect(parseFinishTime("600")).toBe(600);
    });
  });

  describe("whitespace handling", () => {
    it("trims leading and trailing whitespace", () => {
      expect(parseFinishTime("  1:23  ")).toBe(83);
      expect(parseFinishTime("  45  ")).toBe(45);
    });
  });

  describe("invalid inputs", () => {
    it("returns null for an empty string", () => {
      expect(parseFinishTime("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(parseFinishTime("   ")).toBeNull();
    });

    it("returns null for non-numeric input", () => {
      expect(parseFinishTime("abc")).toBeNull();
    });

    it("returns null for negative seconds in mm:ss", () => {
      expect(parseFinishTime("-1:30")).toBeNull();
    });

    it("returns null when seconds exceed 59 in mm:ss format", () => {
      expect(parseFinishTime("1:60")).toBeNull();
    });

    it("returns null for negative plain seconds", () => {
      expect(parseFinishTime("-10")).toBeNull();
    });

    it("returns null for multiple colons", () => {
      expect(parseFinishTime("1:2:3")).toBeNull();
    });

    it("returns null for colon-only input", () => {
      expect(parseFinishTime(":")).toBeNull();
    });

    it("returns null when minutes part is non-numeric", () => {
      expect(parseFinishTime("abc:30")).toBeNull();
    });

    it("returns null when seconds part is non-numeric", () => {
      expect(parseFinishTime("1:abc")).toBeNull();
    });
  });
});

describe("isFinishTimeValid", () => {
  const DURATION = 600; // 10:00 bout

  describe("optional / default behavior", () => {
    it("treats an empty string as valid (finish time is optional)", () => {
      expect(isFinishTimeValid("", DURATION)).toBe(true);
    });

    it("treats a whitespace-only string as valid", () => {
      expect(isFinishTimeValid("   ", DURATION)).toBe(true);
    });
  });

  describe("in-bounds times are accepted", () => {
    it("accepts a plain-seconds time within the duration", () => {
      expect(isFinishTimeValid("270", DURATION)).toBe(true);
    });

    it("accepts an mm:ss time within the duration", () => {
      expect(isFinishTimeValid("4:30", DURATION)).toBe(true);
    });

    it("accepts a time exactly equal to the duration (boundary)", () => {
      expect(isFinishTimeValid("10:00", DURATION)).toBe(true);
      expect(isFinishTimeValid("600", DURATION)).toBe(true);
    });

    it("accepts 0", () => {
      expect(isFinishTimeValid("0", DURATION)).toBe(true);
      expect(isFinishTimeValid("0:00", DURATION)).toBe(true);
    });
  });

  describe("over-duration times are rejected", () => {
    it("rejects a plain-seconds time past the duration", () => {
      expect(isFinishTimeValid("601", DURATION)).toBe(false);
    });

    it("rejects an mm:ss time past the duration", () => {
      expect(isFinishTimeValid("11:00", DURATION)).toBe(false);
    });

    it("rejects an unbounded mm:ss time (e.g. 59:59)", () => {
      expect(isFinishTimeValid("59:59", DURATION)).toBe(false);
    });
  });

  describe("malformed input is rejected", () => {
    it("rejects non-numeric input", () => {
      expect(isFinishTimeValid("abc", DURATION)).toBe(false);
    });

    it("rejects seconds > 59 in mm:ss (parser failure)", () => {
      expect(isFinishTimeValid("1:60", DURATION)).toBe(false);
    });

    it("rejects negative input", () => {
      expect(isFinishTimeValid("-10", DURATION)).toBe(false);
    });
  });
});

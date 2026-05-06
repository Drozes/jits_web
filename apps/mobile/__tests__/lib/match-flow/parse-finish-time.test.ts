/**
 * Tests for parseFinishTime: converts "mm:ss" or plain seconds strings into
 * an integer number of seconds.
 *
 * Source: apps/mobile/lib/match-flow/parse-finish-time.ts
 */

import { parseFinishTime } from "@/lib/match-flow/parse-finish-time";

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

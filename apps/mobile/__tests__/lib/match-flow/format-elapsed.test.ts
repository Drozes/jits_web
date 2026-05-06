/**
 * Tests for formatElapsed: converts seconds into "mm:ss" display strings.
 *
 * Source: apps/mobile/lib/match-flow/format-elapsed.ts
 */

import { formatElapsed } from "@/lib/match-flow/format-elapsed";

describe("formatElapsed", () => {
  describe("normal values", () => {
    it("formats 0 seconds as 00:00", () => {
      expect(formatElapsed(0)).toBe("00:00");
    });

    it("formats single-digit seconds with leading zero", () => {
      expect(formatElapsed(5)).toBe("00:05");
    });

    it("formats 59 seconds correctly", () => {
      expect(formatElapsed(59)).toBe("00:59");
    });

    it("formats exactly 1 minute", () => {
      expect(formatElapsed(60)).toBe("01:00");
    });

    it("formats 1 minute 30 seconds", () => {
      expect(formatElapsed(90)).toBe("01:30");
    });

    it("formats 5 minutes 0 seconds", () => {
      expect(formatElapsed(300)).toBe("05:00");
    });

    it("formats 10 minutes 15 seconds", () => {
      expect(formatElapsed(615)).toBe("10:15");
    });

    it("formats times over an hour (minutes exceed 59)", () => {
      // 1 hour = 3600 seconds => 60:00
      expect(formatElapsed(3600)).toBe("60:00");
    });

    it("formats very long matches", () => {
      // 99 minutes 59 seconds = 5999 seconds
      expect(formatElapsed(5999)).toBe("99:59");
    });
  });

  describe("fractional seconds", () => {
    it("floors fractional seconds", () => {
      expect(formatElapsed(61.7)).toBe("01:01");
    });

    it("floors 59.99 to 00:59", () => {
      expect(formatElapsed(59.99)).toBe("00:59");
    });
  });

  describe("edge cases and invalid inputs", () => {
    it('returns "00:00" for negative values', () => {
      expect(formatElapsed(-1)).toBe("00:00");
      expect(formatElapsed(-100)).toBe("00:00");
    });

    it('returns "00:00" for NaN', () => {
      expect(formatElapsed(NaN)).toBe("00:00");
    });

    it('returns "00:00" for Infinity', () => {
      expect(formatElapsed(Infinity)).toBe("00:00");
    });

    it('returns "00:00" for negative Infinity', () => {
      expect(formatElapsed(-Infinity)).toBe("00:00");
    });
  });
});

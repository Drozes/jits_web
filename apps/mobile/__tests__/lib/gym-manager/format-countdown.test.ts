/**
 * Tests for formatCountdown: time-until-an-ISO-instant as a compact "3H 14M"
 * countdown for the gym-owner hub next-session plate.
 *
 * Source: apps/mobile/lib/gym-manager/format-countdown.ts
 */

import { formatCountdown } from "@/lib/gym-manager/format-countdown";

const NOW = new Date("2026-05-16T12:00:00.000Z").getTime();

function future(ms: number): string {
  return new Date(NOW + ms).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("minutes only (under an hour)", () => {
    it("formats a few minutes out", () => {
      expect(formatCountdown(future(14 * MIN))).toBe("14M");
    });

    it("formats 59 minutes", () => {
      expect(formatCountdown(future(59 * MIN))).toBe("59M");
    });

    it("rounds partial minutes down", () => {
      expect(formatCountdown(future(14 * MIN + 59_000))).toBe("14M");
    });
  });

  describe("hours and minutes", () => {
    it('formats the wireframe "3H 14M" example', () => {
      expect(formatCountdown(future(3 * HOUR + 14 * MIN))).toBe("3H 14M");
    });

    it("formats a whole-hour gap as H + 0M", () => {
      expect(formatCountdown(future(2 * HOUR))).toBe("2H 0M");
    });

    it("formats just under a day", () => {
      expect(formatCountdown(future(23 * HOUR + 59 * MIN))).toBe("23H 59M");
    });
  });

  describe("days and hours", () => {
    it("formats a multi-day gap as D + H", () => {
      expect(formatCountdown(future(2 * DAY + 5 * HOUR))).toBe("2D 5H");
    });

    it("drops minutes once days are present", () => {
      expect(formatCountdown(future(1 * DAY + 3 * HOUR + 14 * MIN))).toBe("1D 3H");
    });
  });

  describe("at or past the start time", () => {
    it('returns "0M" exactly at start', () => {
      expect(formatCountdown(future(0))).toBe("0M");
    });

    it('returns "0M" for a past instant', () => {
      expect(formatCountdown(future(-5 * MIN))).toBe("0M");
    });
  });
});

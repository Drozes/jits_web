/**
 * Tests for the gym-owner roster/athlete-detail formatters (H6/H7):
 * formatLastActive, formatWinRate, formatFinish.
 *
 * Source: apps/mobile/lib/gym-manager/roster-format.ts
 */

import {
  formatFinish,
  formatLastActive,
  formatWinRate,
} from "@/lib/gym-manager/roster-format";
import type { GymAthleteRecentMatch } from "@jits/shared/types/gym-portal";

const NOW = new Date("2026-05-16T12:00:00.000Z").getTime();

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatLastActive", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "No matches yet" when never matched', () => {
    expect(formatLastActive(null)).toBe("No matches yet");
  });

  it('prefixes "Active" and lowercases the relative date', () => {
    // formatRelativeDate -> "Today" within the same day window.
    expect(formatLastActive(ago(2 * HOUR))).toBe("Active today");
  });

  it("formats a multi-day gap", () => {
    expect(formatLastActive(ago(3 * DAY))).toBe("Active 3d ago");
  });

  it('formats yesterday as "Active yesterday"', () => {
    expect(formatLastActive(ago(1 * DAY + 1 * HOUR))).toBe("Active yesterday");
  });
});

describe("formatWinRate", () => {
  it('returns an em-dash for a 0-match athlete', () => {
    expect(formatWinRate(0, 0)).toBe("—");
  });

  it("rounds the fraction to a whole percent", () => {
    expect(formatWinRate(0.667, 134)).toBe("67%");
  });

  it("formats a perfect record", () => {
    expect(formatWinRate(1, 5)).toBe("100%");
  });

  it("rounds half up", () => {
    expect(formatWinRate(0.555, 20)).toBe("56%");
  });
});

describe("formatFinish", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function match(over: Partial<GymAthleteRecentMatch>): GymAthleteRecentMatch {
    return {
      opponent_name: "Tristan Charbonneau",
      result: "win",
      submission: null,
      elo_delta: 12,
      occurred_at: ago(2 * DAY),
      ...over,
    };
  }

  it("names the submission technique", () => {
    expect(formatFinish(match({ submission: "Armbar" }))).toBe(
      "2d ago · Submission · Armbar",
    );
  });

  it("renders a time-expiry decision when there is no submission", () => {
    expect(formatFinish(match({ submission: null }))).toBe(
      "2d ago · Decision (Time)",
    );
  });

  it('labels a draw as "Draw", not a decision', () => {
    expect(formatFinish(match({ result: "draw", submission: null }))).toBe(
      "2d ago · Draw",
    );
  });
});

/**
 * Tests for the gym-owner one-time session editor (H3) date/time helpers.
 *
 * Source: apps/mobile/lib/gym-manager/session-datetime.ts
 */

import {
  addHours,
  combineDateAndTime,
  durationHours,
  formatSessionRowDate,
  formatSessionRowParts,
  HOUR_MS,
} from "@/lib/gym-manager/session-datetime";

describe("combineDateAndTime", () => {
  it("takes the calendar date from `date` and the clock from `time`", () => {
    const date = new Date(2026, 4, 16, 9, 5, 0); // May 16 09:05
    const time = new Date(2026, 0, 1, 14, 30, 0); // Jan 1 14:30
    const result = combineDateAndTime(date, time);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4);
    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it("zeroes seconds and milliseconds", () => {
    const date = new Date(2026, 4, 16, 9, 5, 45, 123);
    const time = new Date(2026, 0, 1, 14, 30, 22, 999);
    const result = combineDateAndTime(date, time);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("does not mutate either input", () => {
    const date = new Date(2026, 4, 16, 9, 5, 0);
    const time = new Date(2026, 0, 1, 14, 30, 0);
    const dateMs = date.getTime();
    const timeMs = time.getTime();
    combineDateAndTime(date, time);
    expect(date.getTime()).toBe(dateMs);
    expect(time.getTime()).toBe(timeMs);
  });
});

describe("addHours", () => {
  it("adds whole hours and returns a new Date", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    const end = addHours(start, 2);
    expect(end.getTime() - start.getTime()).toBe(2 * HOUR_MS);
    expect(end).not.toBe(start);
  });

  it("does not mutate the start", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    const before = start.getTime();
    addHours(start, 3);
    expect(start.getTime()).toBe(before);
  });
});

describe("durationHours", () => {
  it("returns the whole-hour gap", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    const end = new Date(2026, 4, 16, 16, 0, 0);
    expect(durationHours(start, end)).toBe(2);
  });

  it("rounds to the nearest hour", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    const end = new Date(2026, 4, 16, 16, 40, 0); // 2h40m -> 3
    expect(durationHours(start, end)).toBe(3);
  });

  it("floors at 1 hour even for a zero/negative gap", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    expect(durationHours(start, start)).toBe(1);
    expect(durationHours(start, new Date(2026, 4, 16, 13, 0, 0))).toBe(1);
  });

  it("floors a sub-hour gap up to 1", () => {
    const start = new Date(2026, 4, 16, 14, 0, 0);
    const end = new Date(2026, 4, 16, 14, 20, 0); // 20m rounds to 0 -> floored to 1
    expect(durationHours(start, end)).toBe(1);
  });
});

describe("formatSessionRowParts", () => {
  it("returns an upper-cased weekday and a clock time", () => {
    // 2026-05-16 is a Saturday.
    const { day, time } = formatSessionRowParts(
      new Date(2026, 4, 16, 14, 0, 0).toISOString(),
    );
    expect(day).toBe(day.toUpperCase());
    expect(day.length).toBeGreaterThan(0);
    expect(time).toMatch(/\d/);
  });
});

describe("formatSessionRowDate", () => {
  it('prefixes the date with "One-time"', () => {
    const label = formatSessionRowDate(new Date(2026, 4, 16, 14, 0, 0).toISOString());
    expect(label.startsWith("One-time · ")).toBe(true);
  });
});

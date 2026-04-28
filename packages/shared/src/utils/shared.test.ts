import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getInitials,
  extractGymName,
  formatRelativeDate,
  formatRelativeTime,
} from "./shared";

describe("getInitials", () => {
  it("returns two-letter initials from a full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns a single letter for a single name", () => {
    expect(getInitials("John")).toBe("J");
  });

  it("truncates to 2 characters for 3+ names", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("jane doe")).toBe("JD");
  });

  it("returns empty string for empty input", () => {
    expect(getInitials("")).toBe("");
  });

  it("handles names with extra whitespace", () => {
    expect(getInitials("  Jane   Doe  ")).toBe("JD");
  });

  it("handles a single character name", () => {
    expect(getInitials("A")).toBe("A");
  });
});

describe("extractGymName", () => {
  it("extracts name from a single object (to-one FK join)", () => {
    expect(extractGymName({ name: "Gracie Barra" })).toBe("Gracie Barra");
  });

  it("extracts name from an array with one element (legacy FK join)", () => {
    expect(extractGymName([{ name: "10th Planet" }])).toBe("10th Planet");
  });

  it("extracts the first name from an array with multiple elements", () => {
    expect(
      extractGymName([{ name: "First Gym" }, { name: "Second Gym" }]),
    ).toBe("First Gym");
  });

  it("returns null for null input", () => {
    expect(extractGymName(null)).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(extractGymName([])).toBeNull();
  });
});

describe("formatRelativeDate", () => {
  const FIXED_NOW = new Date("2026-04-25T12:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Today' for a date from today", () => {
    expect(formatRelativeDate("2026-04-25T08:00:00Z")).toBe("Today");
  });

  it("returns 'Yesterday' for a date from one day ago", () => {
    expect(formatRelativeDate("2026-04-24T08:00:00Z")).toBe("Yesterday");
  });

  it("returns days ago for 2-6 days", () => {
    expect(formatRelativeDate("2026-04-23T08:00:00Z")).toBe("2d ago");
    expect(formatRelativeDate("2026-04-20T08:00:00Z")).toBe("5d ago");
  });

  it("returns weeks ago for 7-29 days", () => {
    expect(formatRelativeDate("2026-04-18T08:00:00Z")).toBe("1w ago");
    expect(formatRelativeDate("2026-04-11T08:00:00Z")).toBe("2w ago");
  });

  it("returns months ago for 30+ days", () => {
    expect(formatRelativeDate("2026-03-25T08:00:00Z")).toBe("1mo ago");
    expect(formatRelativeDate("2026-02-20T08:00:00Z")).toBe("2mo ago");
  });
});

describe("formatRelativeTime", () => {
  const FIXED_NOW = new Date("2026-04-25T12:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'now' for a timestamp less than 1 minute ago", () => {
    expect(formatRelativeTime("2026-04-25T11:59:30Z")).toBe("now");
    expect(formatRelativeTime("2026-04-25T12:00:00Z")).toBe("now");
  });

  it("returns minutes for 1-59 minutes ago", () => {
    expect(formatRelativeTime("2026-04-25T11:55:00Z")).toBe("5m");
    expect(formatRelativeTime("2026-04-25T11:01:00Z")).toBe("59m");
  });

  it("returns hours for 1-23 hours ago", () => {
    expect(formatRelativeTime("2026-04-25T10:00:00Z")).toBe("2h");
    expect(formatRelativeTime("2026-04-24T13:00:00Z")).toBe("23h");
  });

  it("returns days for 1-6 days ago", () => {
    expect(formatRelativeTime("2026-04-24T12:00:00Z")).toBe("1d");
    expect(formatRelativeTime("2026-04-19T12:00:00Z")).toBe("6d");
  });

  it("returns a formatted date for 7+ days ago", () => {
    const result = formatRelativeTime("2026-04-15T12:00:00Z");
    // The exact format depends on the locale, but should contain "Apr" and "15"
    expect(result).toContain("Apr");
    expect(result).toContain("15");
  });
});

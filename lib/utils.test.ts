import { describe, it, expect } from "vitest";
import {
  getInitials,
  computeStats,
  computeWinStreak,
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

describe("computeStats", () => {
  it("computes wins, losses, and win rate", () => {
    const outcomes = [
      { outcome: "win" },
      { outcome: "win" },
      { outcome: "loss" },
    ];
    expect(computeStats(outcomes)).toEqual({
      wins: 2,
      losses: 1,
      winRate: 67,
    });
  });

  it("returns zeros for empty array", () => {
    expect(computeStats([])).toEqual({ wins: 0, losses: 0, winRate: 0 });
  });

  it("handles all wins", () => {
    const outcomes = [{ outcome: "win" }, { outcome: "win" }];
    expect(computeStats(outcomes)).toEqual({
      wins: 2,
      losses: 0,
      winRate: 100,
    });
  });

  it("ignores null outcomes", () => {
    const outcomes = [
      { outcome: "win" },
      { outcome: null },
      { outcome: "loss" },
    ];
    expect(computeStats(outcomes)).toEqual({
      wins: 1,
      losses: 1,
      winRate: 50,
    });
  });

  it("ignores draw outcomes in win/loss count", () => {
    const outcomes = [
      { outcome: "win" },
      { outcome: "draw" },
      { outcome: "loss" },
    ];
    expect(computeStats(outcomes)).toEqual({
      wins: 1,
      losses: 1,
      winRate: 50,
    });
  });
});

describe("computeWinStreak", () => {
  it("counts consecutive wins from start", () => {
    const outcomes = [
      { outcome: "win" },
      { outcome: "win" },
      { outcome: "loss" },
      { outcome: "win" },
    ];
    expect(computeWinStreak(outcomes)).toBe(2);
  });

  it("returns 0 when first outcome is a loss", () => {
    const outcomes = [{ outcome: "loss" }, { outcome: "win" }];
    expect(computeWinStreak(outcomes)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(computeWinStreak([])).toBe(0);
  });

  it("counts all wins if unbroken", () => {
    const outcomes = [
      { outcome: "win" },
      { outcome: "win" },
      { outcome: "win" },
    ];
    expect(computeWinStreak(outcomes)).toBe(3);
  });
});

describe("extractGymName", () => {
  it("extracts name from FK join array", () => {
    expect(extractGymName([{ name: "Gracie Barra" }])).toBe("Gracie Barra");
  });

  it("returns null for null input", () => {
    expect(extractGymName(null)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractGymName([])).toBeNull();
  });

  it("returns first gym name when multiple present", () => {
    expect(
      extractGymName([{ name: "First Gym" }, { name: "Second Gym" }]),
    ).toBe("First Gym");
  });
});

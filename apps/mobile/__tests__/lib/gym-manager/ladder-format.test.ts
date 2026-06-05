/**
 * Tests for the gym-owner gym ladder helpers (H9 inter-gym comparison):
 * formatGymMeta, deriveCities, formatLadderSummary, findOwnGym.
 *
 * Source: apps/mobile/lib/gym-manager/ladder-format.ts
 */

import {
  deriveCities,
  findOwnGym,
  formatGymMeta,
  formatLadderSummary,
} from "@/lib/gym-manager/ladder-format";
import type { GymLadderRow } from "@jits/shared/types/gym-portal";

function row(over: Partial<GymLadderRow>): GymLadderRow {
  return {
    gymId: "g1",
    gymName: "10th Planet Toronto",
    city: "Toronto",
    athleteCount: 28,
    matchCount: 142,
    avgElo: 1777,
    momentum: 12,
    ...over,
  };
}

describe("formatGymMeta", () => {
  it("joins city, athletes, and matches", () => {
    expect(formatGymMeta(row({}))).toBe("Toronto · 28 Athletes · 142 Matches");
  });

  it("singularizes counts of one", () => {
    expect(formatGymMeta(row({ athleteCount: 1, matchCount: 1 }))).toBe(
      "Toronto · 1 Athlete · 1 Match",
    );
  });

  it("drops a null city so the line never starts with a separator", () => {
    expect(formatGymMeta(row({ city: null }))).toBe("28 Athletes · 142 Matches");
  });

  it("drops a blank/whitespace city", () => {
    expect(formatGymMeta(row({ city: "   " }))).toBe("28 Athletes · 142 Matches");
  });
});

describe("deriveCities", () => {
  it("returns distinct cities sorted case-insensitively", () => {
    const rows = [
      row({ gymId: "a", city: "Vancouver" }),
      row({ gymId: "b", city: "toronto" }),
      row({ gymId: "c", city: "Toronto" }),
      row({ gymId: "d", city: "Calgary" }),
    ];
    expect(deriveCities(rows)).toEqual(["Calgary", "toronto", "Toronto", "Vancouver"]);
  });

  it("drops null and blank cities", () => {
    const rows = [
      row({ gymId: "a", city: null }),
      row({ gymId: "b", city: "  " }),
      row({ gymId: "c", city: "Toronto" }),
    ];
    expect(deriveCities(rows)).toEqual(["Toronto"]);
  });

  it("trims city names", () => {
    expect(deriveCities([row({ city: "  Toronto  " })])).toEqual(["Toronto"]);
  });

  it("returns an empty array for no rows", () => {
    expect(deriveCities([])).toEqual([]);
  });
});

describe("formatLadderSummary", () => {
  it("builds the summary line with a range suffix", () => {
    expect(formatLadderSummary(12, "90d")).toBe("12 Partner Gyms · 90d");
  });

  it("singularizes a single gym", () => {
    expect(formatLadderSummary(1, "30d")).toBe("1 Partner Gym · 30d");
  });

  it("handles zero", () => {
    expect(formatLadderSummary(0, "All")).toBe("0 Partner Gyms · All");
  });
});

describe("findOwnGym", () => {
  const rows = [
    row({ gymId: "g1", avgElo: 1777 }),
    row({ gymId: "g2", avgElo: 1742 }),
    row({ gymId: "g3", avgElo: 1684 }),
  ];

  it("returns the 1-based rank and row of the own gym", () => {
    const found = findOwnGym(rows, "g2");
    expect(found?.rank).toBe(2);
    expect(found?.row.gymId).toBe("g2");
  });

  it("ranks the leader at 1", () => {
    expect(findOwnGym(rows, "g1")?.rank).toBe(1);
  });

  it("returns null when the own gym is absent (e.g. filtered out)", () => {
    expect(findOwnGym(rows, "missing")).toBeNull();
  });

  it("returns null when no own gym id is supplied", () => {
    expect(findOwnGym(rows, undefined)).toBeNull();
  });
});

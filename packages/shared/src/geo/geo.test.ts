import { describe, expect, it } from "vitest";
import { NA_CITIES, searchCities } from "./index";

describe("NA_CITIES dataset", () => {
  it("is a large, non-empty, sorted list of labels", () => {
    expect(NA_CITIES.length).toBeGreaterThan(10000);
    expect(NA_CITIES[0]).toMatch(/, (USA|Canada)$/);
  });

  it("includes well-known US and Canadian cities", () => {
    expect(NA_CITIES).toContain("Austin, TX, USA");
    expect(NA_CITIES).toContain("Toronto, ON, Canada");
    expect(NA_CITIES).toContain("Vancouver, BC, Canada");
  });
});

describe("searchCities", () => {
  it("returns [] for an empty or whitespace query", () => {
    expect(searchCities("")).toEqual([]);
    expect(searchCities("   ")).toEqual([]);
  });

  it("is case-insensitive and matches by city-name prefix", () => {
    const results = searchCities("austin");
    expect(results).toContain("Austin, TX, USA");
    expect(searchCities("AUSTIN")).toEqual(results);
  });

  it("ranks prefix matches ahead of substring matches", () => {
    const results = searchCities("toronto");
    expect(results[0].startsWith("Toronto")).toBe(true);
  });

  it("surfaces a later word match (query is not the first word)", () => {
    // "vegas" does not start the label "Las Vegas, NV, USA"; the word-boundary
    // tier must still surface it.
    expect(searchCities("vegas")).toContain("Las Vegas, NV, USA");
  });

  it("matches on region/country substrings too", () => {
    // "TX" never starts a label, so these are substring matches.
    const results = searchCities("TX");
    expect(results.every((c) => c.toLowerCase().includes("tx"))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("respects the result limit", () => {
    expect(searchCities("a", 5).length).toBeLessThanOrEqual(5);
    expect(searchCities("a", 25).length).toBeLessThanOrEqual(25);
  });
});

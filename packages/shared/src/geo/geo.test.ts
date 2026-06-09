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

  it("excludes counties, parishes, and municipios", () => {
    expect(NA_CITIES).not.toContain("Austin County, TX, USA");
    expect(NA_CITIES.some((c) => /\b(County|Parish|Municipio)\b/.test(c))).toBe(
      false,
    );
  });
});

describe("searchCities", () => {
  it("returns [] for an empty or whitespace query", () => {
    expect(searchCities("")).toEqual([]);
    expect(searchCities("   ")).toEqual([]);
  });

  it("returns [] for a single-character query (too ambiguous)", () => {
    expect(searchCities("a")).toEqual([]);
    expect(searchCities("a", 25)).toEqual([]);
  });

  it("is case-insensitive and matches by city-name prefix", () => {
    const results = searchCities("austin");
    expect(results).toContain("Austin, TX, USA");
    expect(searchCities("AUSTIN")).toEqual(results);
  });

  it("floats a major metro to the top of its tier over same-prefix towns", () => {
    // Without the prominence boost, alphabetical order would surface "Austin,
    // AR" / "Austin, IN" ahead of the metro people mean.
    expect(searchCities("austin")[0]).toBe("Austin, TX, USA");
    expect(searchCities("las")[0]).toBe("Las Vegas, NV, USA");
    expect(searchCities("los")[0]).toBe("Los Angeles, CA, USA");
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

  it("matches on region substrings but not the trailing country", () => {
    // "TX" never starts a label, so these are region substring matches.
    const results = searchCities("TX");
    expect(results.every((c) => c.toLowerCase().includes("tx"))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    // The country suffix is excluded from matching: "Austin, TX, USA" has "usa"
    // only in its country, so it must NOT match "usa" (a city that literally
    // contains the substring, like Sausalito, still can). Excluding the country
    // is what stops "usa"/"sa" from flooding every row and keeps the sort fast.
    expect(searchCities("usa")).not.toContain("Austin, TX, USA");
  });

  it("never returns duplicate labels", () => {
    const results = searchCities("san", 30);
    expect(new Set(results).size).toBe(results.length);
  });

  it("respects the result limit", () => {
    expect(searchCities("san", 5).length).toBeLessThanOrEqual(5);
    expect(searchCities("san", 25).length).toBeLessThanOrEqual(25);
  });
});

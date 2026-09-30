import { describe, expect, it } from "vitest";
import { recordedEloDelta } from "./recorded-delta";

describe("recordedEloDelta", () => {
  it("returns the delta when the match recorded a rating", () => {
    expect(recordedEloDelta({ elo_delta: 12, elo_after: 1212 })).toBe(12);
    expect(recordedEloDelta({ elo_delta: -8, elo_after: 1192 })).toBe(-8);
  });

  it("keeps a real zero change on a rated match", () => {
    expect(recordedEloDelta({ elo_delta: 0, elo_after: 1200 })).toBe(0);
  });

  it("returns null for a legacy unrated row (backend shape: delta 0, after null)", () => {
    expect(recordedEloDelta({ elo_delta: 0, elo_after: null })).toBeNull();
    expect(recordedEloDelta({ elo_delta: 0 })).toBeNull();
  });

  it("returns null when the delta itself is missing or not finite", () => {
    expect(recordedEloDelta({ elo_delta: null, elo_after: 1200 })).toBeNull();
    expect(recordedEloDelta({ elo_delta: Number.NaN, elo_after: 1200 })).toBeNull();
  });
});

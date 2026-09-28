import { describe, expect, it } from "vitest";
import { NO_MATCH_REASON_MAX, isNoMatch, toMatchDetected, toNoMatchReason } from "./match-detection";

describe("match detection helpers (jr_be-0qf)", () => {
  it("keeps only JSON booleans; everything else is unknown", () => {
    expect(toMatchDetected(true)).toBe(true);
    expect(toMatchDetected(false)).toBe(false);
    for (const v of [null, undefined, "false", 0, 1, {}]) expect(toMatchDetected(v)).toBeNull();
  });

  it("returns a trimmed reason only for an explicit false", () => {
    expect(toNoMatchReason(false, "  Empty room.  ")).toBe("Empty room.");
    expect(toNoMatchReason(true, "Empty room.")).toBeNull();
    expect(toNoMatchReason(null, "Empty room.")).toBeNull();
    expect(toNoMatchReason(false, "   ")).toBeNull();
    expect(toNoMatchReason(false, 42)).toBeNull();
    expect(toNoMatchReason(false, "x".repeat(900))).toHaveLength(NO_MATCH_REASON_MAX);
  });

  it("isNoMatch is true only for an explicit false", () => {
    expect(isNoMatch({ match_detected: false })).toBe(true);
    expect(isNoMatch({ match_detected: true })).toBe(false);
    expect(isNoMatch({ match_detected: null })).toBe(false);
    expect(isNoMatch({})).toBe(false);
    expect(isNoMatch(null)).toBe(false);
  });
});

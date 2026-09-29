import { describe, expect, it } from "vitest";
import { ARENA_CHALLENGE_FRESH_MS } from "../constants";
import { challengeStaleAt, isFreshChallenge } from "./challenge-freshness";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const created = (ageMs: number) => new Date(NOW - ageMs).toISOString();

describe("isFreshChallenge", () => {
  it("is inclusive at exactly ARENA_CHALLENGE_FRESH_MS and stale one ms later", () => {
    expect(isFreshChallenge(created(0), NOW)).toBe(true);
    expect(isFreshChallenge(created(ARENA_CHALLENGE_FRESH_MS - 1), NOW)).toBe(true);
    expect(isFreshChallenge(created(ARENA_CHALLENGE_FRESH_MS), NOW)).toBe(true);
    expect(isFreshChallenge(created(ARENA_CHALLENGE_FRESH_MS + 1), NOW)).toBe(false);
  });

  it("an undatable challenge is never fresh", () => {
    expect(isFreshChallenge(null, NOW)).toBe(false);
    expect(isFreshChallenge(undefined, NOW)).toBe(false);
    expect(isFreshChallenge("", NOW)).toBe(false);
    expect(isFreshChallenge("not a date", NOW)).toBe(false);
  });
});

describe("challengeStaleAt", () => {
  it("is the first instant isFreshChallenge turns false", () => {
    const c = created(60_000);
    const at = challengeStaleAt(c)!;
    expect(isFreshChallenge(c, at - 1)).toBe(true);
    expect(isFreshChallenge(c, at)).toBe(false);
  });

  it("is null for an undatable challenge", () => {
    expect(challengeStaleAt("nope")).toBeNull();
    expect(challengeStaleAt(null)).toBeNull();
  });
});

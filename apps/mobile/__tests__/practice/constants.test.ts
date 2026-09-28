/**
 * Practice copy and the one-time Home offer rule (lib/practice/constants.ts).
 */
import {
  PRACTICE_OFFER_BODY,
  PRACTICE_OFFER_TITLE,
  PRACTICE_SUMMARY_TIP_CLIP,
  PRACTICE_LOBBY_BODY,
  PRACTICE_SUMMARY_TIP_NO_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED,
  PRACTICE_TIPS,
  practiceBot,
  shouldOfferPracticeMatch,
} from "@/lib/practice/constants";

const COACH_LINES = [
  ...Object.values(PRACTICE_TIPS).filter((t): t is string => t != null),
  PRACTICE_SUMMARY_TIP_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED,
  PRACTICE_LOBBY_BODY,
];

// Built from code points so this file itself carries no dash characters.
const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL_BAR = String.fromCharCode(0x2015);

describe("practice copy", () => {
  it.each(COACH_LINES)("coach line is 20 words or fewer: %s", (line) => {
    expect(line.trim().split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it.each([...COACH_LINES, PRACTICE_OFFER_TITLE, PRACTICE_OFFER_BODY])(
    "has no em dash and never mentions points, gyms or sessions: %s",
    (line) => {
      expect(line.includes(EM_DASH) || line.includes(HORIZONTAL_BAR)).toBe(false);
      expect(line).not.toMatch(/\bpoints?\b|\bgyms?\b|\bsessions?\b/i);
    },
  );
});

describe("practiceBot", () => {
  it("mirrors the athlete's weight with no rating gap (the row shows No rating)", () => {
    expect(practiceBot({ current_elo: 1234, current_weight: 180 })).toMatchObject({
      id: "practice-bot",
      displayName: "Practice Partner",
      currentElo: 1234,
      eloDiff: 0,
      weight: 180,
      gymName: "Practice bot",
    });
  });
});

describe("shouldOfferPracticeMatch", () => {
  const base = {
    athlete: { practice_match_offered_at: null, is_bot: false },
    hasActiveMatch: false,
    statsLoaded: true,
    hasMatches: false,
  };

  it("offers to a brand-new athlete who has not answered yet", () => {
    expect(shouldOfferPracticeMatch(base)).toBe(true);
  });

  it.each([
    ["already offered", { athlete: { practice_match_offered_at: "2026-09-26", is_bot: false } }],
    ["a bot", { athlete: { practice_match_offered_at: null, is_bot: true } }],
    ["a match in flight", { hasActiveMatch: true }],
    ["stats not loaded yet", { statsLoaded: false }],
    ["has completed matches", { hasMatches: true }],
  ])("does not offer when %s", (_name, override) => {
    expect(shouldOfferPracticeMatch({ ...base, ...override })).toBe(false);
  });
});

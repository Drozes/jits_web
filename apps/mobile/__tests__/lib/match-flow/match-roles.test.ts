/**
 * `deriveMatchRoles` (lib/match-flow/match-roles.ts), the one place the
 * match flow pairs "me" with "the other one" (timekeeper mode ARCHITECTURE
 * 2.1, TEST-PLAN 3.1 item 1). Self-run only: the capability table's
 * self-run rows, null for a viewer who is not one of the two athletes,
 * challenger first, and the `MatchAthleteView` mapping.
 */
import type { MatchDetails } from "@jits/shared/api/queries";
import { deriveMatchRoles, type MatchCaps } from "@/lib/match-flow/match-roles";

const REYES = "reyes";
const OKAFOR = "okafor";

function participant(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1512,
    current_weight: 172.5,
    profile_photo_url: null,
    role: "competitor",
    outcome: null,
    elo_before: null,
    elo_after: null,
    elo_delta: 0,
    weight_division_gap: null,
    ...over,
  };
}

function match(participants: unknown[], extra: Record<string, unknown> = {}): MatchDetails {
  return { id: "M1", status: "pending", participants, ...extra } as unknown as MatchDetails;
}

/** Reyes challenged Okafor (the first participant stands in for the challenger). */
const PAIR = [participant(REYES, "Marco Reyes"), participant(OKAFOR, "Dayo Okafor", { current_elo: 1487, current_weight: 171.4 })];

/** ARCHITECTURE 2.1, self_run column, as the shipped flow behaves today. */
const SELF_RUN: MatchCaps = {
  autoStart: true,
  canStart: false,
  canPauseEnd: true,
  endVia: "broadcast",
  resultEntry: "claim",
  recorderAutoConfirmed: true,
  canConfirm: true,
  canEditResult: false,
  leave: "cancel_for_all",
  recordingRequired: false,
  readyPolicy: "broadcast",
  weightVerdicts: "opponent",
  // Today's confirm step shows the rating block; A25 (slice M5) turns it off.
  showsRatingOnConfirm: true,
  submissionLayout: "chips",
};

describe("deriveMatchRoles: who the viewer is", () => {
  it.each([
    ["the challenger", REYES, "challenger", OKAFOR],
    ["the opponent", OKAFOR, "opponent", REYES],
  ] as const)("%s gets the self-run roles", (_label, viewerId, viewer, otherId) => {
    const roles = deriveMatchRoles(match(PAIR), viewerId)!;
    expect(roles.mode).toBe("self_run");
    expect(roles.viewer).toBe(viewer);
    expect(roles.me?.athleteId).toBe(viewerId);
    expect(roles.opponent?.athleteId).toBe(otherId);
    expect(roles.timekeeper).toBeNull();
  });

  it("lists the challenger first, whoever is viewing", () => {
    for (const viewerId of [REYES, OKAFOR]) {
      const roles = deriveMatchRoles(match(PAIR), viewerId)!;
      expect(roles.athletes.map((a) => a.athleteId)).toEqual([REYES, OKAFOR]);
      expect(roles.athletes.map((a) => a.isChallenger)).toEqual([true, false]);
    }
  });

  it("athletes holds the same two views as me and opponent", () => {
    const roles = deriveMatchRoles(match(PAIR), OKAFOR)!;
    expect(roles.athletes).toContain(roles.me);
    expect(roles.athletes).toContain(roles.opponent);
  });

  it.each([
    ["a stranger", match(PAIR), "someone-else"],
    ["a match with only the viewer in it", match([participant(REYES, "Marco Reyes")]), REYES],
    ["a match with nobody in it", match([]), REYES],
  ])("is null for %s (the wizard's Not a participant)", (_label, m, viewerId) => {
    expect(deriveMatchRoles(m, viewerId)).toBeNull();
  });
});

describe("deriveMatchRoles: the self-run capability rows", () => {
  it.each([REYES, OKAFOR])("viewer %s", (viewerId) => {
    expect(deriveMatchRoles(match(PAIR), viewerId)!.caps).toEqual(SELF_RUN);
  });
});

describe("deriveMatchRoles: flag-OFF payloads all read as self-run", () => {
  const presentFalse = {
    requires_timekeeper: false,
    tk_weight_check_required: false,
    challenger_id: OKAFOR,
    timekeeper_id: null,
    viewer_role: "challenger",
    timekeeper: null,
  };
  it.each([
    ["missing", {}],
    ["false", { requires_timekeeper: false }],
    ["present-false", presentFalse],
  ])("requires_timekeeper %s", (_label, extra) => {
    expect(deriveMatchRoles(match(PAIR, extra), REYES)).toEqual(deriveMatchRoles(match(PAIR), REYES));
  });
});

describe("deriveMatchRoles: MatchAthleteView", () => {
  it("maps every participant field", () => {
    const row = participant(REYES, "Marco Reyes", {
      profile_photo_url: "https://cdn/reyes.jpg",
      outcome: "win",
      elo_before: 1512,
      elo_after: 1528,
      elo_delta: 16,
      weight_division_gap: 1,
    });
    const roles = deriveMatchRoles(match([row, PAIR[1]]), REYES)!;
    expect(roles.me).toEqual({
      athleteId: REYES,
      displayName: "Marco Reyes",
      shortName: "M. Reyes",
      currentElo: 1512,
      weightLbs: 172.5,
      photoUrl: "https://cdn/reyes.jpg",
      outcome: "win",
      eloBefore: 1512,
      eloAfter: 1528,
      eloDelta: 16,
      weightDivisionGap: 1,
      isChallenger: true,
    });
  });

  it("reads a missing field (an older backend) as null", () => {
    const sparse = { athlete_id: OKAFOR, display_name: "Dayo Okafor" };
    const opponent = deriveMatchRoles(match([PAIR[0], sparse]), REYES)!.opponent;
    expect(opponent).toEqual({
      athleteId: OKAFOR,
      displayName: "Dayo Okafor",
      shortName: "D. Okafor",
      currentElo: null,
      weightLbs: null,
      photoUrl: null,
      outcome: null,
      eloBefore: null,
      eloAfter: null,
      eloDelta: null,
      weightDivisionGap: null,
      isChallenger: false,
    });
  });

  it.each([
    ["win", "win"],
    ["loss", "loss"],
    ["draw", "draw"],
    [null, null],
    ["no_contest", null],
  ])("outcome %j reads as %j", (raw, expected) => {
    const roles = deriveMatchRoles(match([participant(REYES, "Marco Reyes", { outcome: raw }), PAIR[1]]), REYES)!;
    expect(roles.me?.outcome).toBe(expected);
  });
});

/**
 * `deriveMatchRoles` (lib/match-flow/match-roles.ts), the one place the
 * match flow pairs "me" with "the other one" (timekeeper mode ARCHITECTURE
 * 2.1, TEST-PLAN 3.1 item 1 and 3.2): the capability table's rows for every
 * role in both modes (the timekeeper's with both values of the
 * `tk_weight_check_required` snapshot), null for a viewer with no role,
 * challenger first (from `challenger_id`, the first participant without it),
 * and the `MatchAthleteView` mapping.
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
  // A25 (slice M5): the confirm step shows no rating block in either mode.
  showsRatingOnConfirm: false,
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
    viewer_role: "opponent",
    timekeeper: null,
  };
  it.each([
    ["missing", {}],
    ["false", { requires_timekeeper: false }],
  ])("requires_timekeeper %s", (_label, extra) => {
    expect(deriveMatchRoles(match(PAIR, extra), REYES)).toEqual(deriveMatchRoles(match(PAIR), REYES));
  });

  it("requires_timekeeper present-false: self-run, and challenger_id decides who challenged (jits-o47s.24)", () => {
    // Reyes is listed first, but the backend names Okafor as the challenger.
    const roles = deriveMatchRoles(match(PAIR, presentFalse), REYES)!;
    expect(roles.mode).toBe("self_run");
    expect(roles.caps).toEqual(SELF_RUN);
    expect(roles.viewer).toBe("opponent");
    expect(roles.me?.athleteId).toBe(REYES);
    expect(roles.opponent?.athleteId).toBe(OKAFOR);
    expect(roles.athletes.map((a) => a.athleteId)).toEqual([OKAFOR, REYES]);
    expect(roles.athletes.map((a) => a.isChallenger)).toEqual([true, false]);
    expect(roles.timekeeper).toBeNull();
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

// ---- challenger_id (jits-o47s.24) ----

describe("deriveMatchRoles: the challenger", () => {
  it("is challenger_id whatever the participant order", () => {
    for (const order of [PAIR, [...PAIR].reverse()]) {
      for (const viewerId of [REYES, OKAFOR]) {
        const roles = deriveMatchRoles(match(order, { challenger_id: OKAFOR }), viewerId)!;
        expect(roles.athletes.map((a) => a.athleteId)).toEqual([OKAFOR, REYES]);
        expect(roles.viewer).toBe(viewerId === OKAFOR ? "challenger" : "opponent");
      }
    }
  });

  it.each([
    ["missing", {}],
    ["null (a session match)", { challenger_id: null }],
    ["not one of the two athletes", { challenger_id: "someone-else" }],
  ])("falls back to the first participant when challenger_id is %s", (_label, extra) => {
    const roles = deriveMatchRoles(match([...PAIR].reverse(), extra), REYES)!;
    expect(roles.athletes.map((a) => a.athleteId)).toEqual([OKAFOR, REYES]);
    expect(roles.viewer).toBe("opponent");
  });
});

// ---- timekeeper mode (TEST-PLAN 3.2, M1) ----

const CRUZ = "cruz";

/** ARCHITECTURE 2.1, TK challenger/opponent column. */
const TK_ATHLETE: MatchCaps = {
  autoStart: false,
  canStart: false,
  canPauseEnd: false,
  endVia: null,
  resultEntry: "wait",
  recorderAutoConfirmed: false,
  canConfirm: true,
  canEditResult: false,
  leave: "cancel_for_all",
  recordingRequired: false,
  readyPolicy: "server_merged",
  weightVerdicts: "opponent",
  showsRatingOnConfirm: false,
  submissionLayout: "chips",
};

/** ARCHITECTURE 2.1, TK timekeeper column, with the timekeeper weight check on (A19). */
const TK_TIMEKEEPER: MatchCaps = {
  autoStart: false,
  canStart: true,
  canPauseEnd: true,
  endVia: "end_match_clock",
  resultEntry: "sole",
  recorderAutoConfirmed: false,
  canConfirm: false,
  canEditResult: true,
  leave: "timekeeper_seat",
  recordingRequired: true,
  readyPolicy: "server_merged",
  weightVerdicts: "both_athletes",
  showsRatingOnConfirm: false,
  submissionLayout: "list",
};

/** A timekeeper-mode match Reyes challenged, Cruz seated (as BE-G reports it). */
function tkMatch(extra: Record<string, unknown> = {}, participants: unknown[] = PAIR) {
  return match(participants, {
    requires_timekeeper: true,
    tk_weight_check_required: true,
    challenger_id: REYES,
    timekeeper_id: CRUZ,
    timekeeper: { id: CRUZ, display_name: "Jo Cruz", profile_photo_url: null },
    ...extra,
  });
}

describe("deriveMatchRoles: timekeeper mode, the athletes", () => {
  it.each([
    ["the challenger", REYES, "challenger", OKAFOR],
    ["the opponent", OKAFOR, "opponent", REYES],
  ] as const)("%s gets the timekeeper-mode athlete row", (_label, viewerId, viewer, otherId) => {
    const roles = deriveMatchRoles(tkMatch(), viewerId)!;
    expect(roles.mode).toBe("timekeeper");
    expect(roles.viewer).toBe(viewer);
    expect(roles.me?.athleteId).toBe(viewerId);
    expect(roles.opponent?.athleteId).toBe(otherId);
    expect(roles.athletes.map((a) => a.athleteId)).toEqual([REYES, OKAFOR]);
    expect(roles.caps).toEqual(TK_ATHLETE);
    expect(roles.timekeeper).toEqual({ id: CRUZ, name: "Jo Cruz", shortName: "J. Cruz" });
  });

  it.each([true, false])("the athlete row is the same whatever the weight-check snapshot (%s)", (required) => {
    expect(deriveMatchRoles(tkMatch({ tk_weight_check_required: required }), REYES)!.caps).toEqual(TK_ATHLETE);
  });

  it("names no timekeeper while the athletes are still picking one", () => {
    const roles = deriveMatchRoles(tkMatch({ timekeeper_id: null, timekeeper: null }), REYES)!;
    expect(roles.timekeeper).toBeNull();
    expect(roles.caps).toEqual(TK_ATHLETE);
  });
});

describe("deriveMatchRoles: timekeeper mode, the timekeeper", () => {
  it("gets the timekeeper row, no athlete pair, the athletes challenger first", () => {
    for (const order of [PAIR, [...PAIR].reverse()]) {
      const roles = deriveMatchRoles(tkMatch({}, order), CRUZ)!;
      expect(roles.mode).toBe("timekeeper");
      expect(roles.viewer).toBe("timekeeper");
      expect(roles.me).toBeNull();
      expect(roles.opponent).toBeNull();
      expect(roles.athletes.map((a) => a.athleteId)).toEqual([REYES, OKAFOR]);
      expect(roles.athletes.map((a) => a.isChallenger)).toEqual([true, false]);
      expect(roles.caps).toEqual(TK_TIMEKEEPER);
      expect(roles.timekeeper).toEqual({ id: CRUZ, name: "Jo Cruz", shortName: "J. Cruz" });
    }
  });

  it("has no weight verdicts when the match snapshot has the timekeeper weight check off (A19)", () => {
    const caps = deriveMatchRoles(tkMatch({ tk_weight_check_required: false }), CRUZ)!.caps;
    expect(caps).toEqual({ ...TK_TIMEKEEPER, weightVerdicts: "none" });
    expect(deriveMatchRoles(tkMatch({ tk_weight_check_required: undefined }), CRUZ)!.caps.weightVerdicts).toBe("none");
  });

  it("keeps the seat's id when the timekeeper identity is missing from the read", () => {
    expect(deriveMatchRoles(tkMatch({ timekeeper: null }), CRUZ)!.timekeeper).toEqual({ id: CRUZ, name: "", shortName: "" });
  });

  it("is null for a timekeeper no longer seated, and for a stranger", () => {
    expect(deriveMatchRoles(tkMatch({ timekeeper_id: null, timekeeper: null }), CRUZ)).toBeNull();
    expect(deriveMatchRoles(tkMatch(), "someone-else")).toBeNull();
  });

  it("is null without two athletes", () => {
    expect(deriveMatchRoles(tkMatch({}, [PAIR[0]]), CRUZ)).toBeNull();
  });
});

describe("deriveMatchRoles: a two-athlete match never has a timekeeper role (B-R5)", () => {
  it("a flag-OFF record-only timekeeper (the code join) stays Not a participant", () => {
    const recordOnly = match(PAIR, {
      timekeeper_id: CRUZ,
      timekeeper: { id: CRUZ, display_name: "Jo Cruz", profile_photo_url: null },
      viewer_role: "timekeeper",
    });
    expect(deriveMatchRoles(recordOnly, CRUZ)).toBeNull();
    expect(deriveMatchRoles(match(PAIR, { requires_timekeeper: false, timekeeper_id: CRUZ }), CRUZ)).toBeNull();
  });

  it("its athletes keep the self-run row and no timekeeper, even with one recording", () => {
    const roles = deriveMatchRoles(match(PAIR, { timekeeper_id: CRUZ }), REYES)!;
    expect(roles.caps).toEqual(SELF_RUN);
    expect(roles.timekeeper).toBeNull();
  });
});

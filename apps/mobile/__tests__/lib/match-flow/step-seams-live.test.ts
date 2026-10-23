/**
 * The live seam `stepSeams` hands the live step (slice M4; ARCHITECTURE 2.3
 * "End" and "Live controls"): `endVia` straight from the capability table,
 * and, in a timekeeper-mode match with a seated timekeeper, who runs the
 * clock (short name), whether this viewer may Leave from the live screen,
 * the athletes' offline read and the no-contest instant, plus the seated
 * timekeeper's id (an athlete freezes only on their `match_ended`) and the
 * ended-by short name. A two-athlete match gets the shipped broadcast end and
 * no timekeeper seam. Also the face-off's TK-D7 input before the start
 * (spec 4.3 "Seated, before start"), table-tested per viewer and presence.
 */
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { stepSeams } from "@/lib/match-flow/step-seams";

function participant(id: string, name: string) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1500,
    current_weight: 170,
    profile_photo_url: null,
    role: "competitor",
    outcome: null,
    elo_before: null,
    elo_after: null,
    elo_delta: null,
    weight_division_gap: null,
  };
}

function match(o: { tk: boolean; seated?: boolean }): MatchDetails {
  const seated = o.seated ?? true;
  return {
    id: "M1",
    status: "in_progress",
    duration_seconds: 300,
    participants: [participant("a-1", "Marcus Reyes"), participant("a-2", "Dana Okafor")],
    challenger_id: "a-1",
    requires_timekeeper: o.tk,
    tk_weight_check_required: true,
    timekeeper_id: o.tk && seated ? "tk-1" : null,
    timekeeper: o.tk && seated ? { id: "tk-1", display_name: "Jordan Cruz", profile_photo_url: null } : null,
  } as unknown as MatchDetails;
}

function state(o: Partial<TimekeeperMatchState>): TimekeeperMatchState {
  return {
    ready: [],
    athleteChecks: [],
    timekeeperChecks: [],
    openRequest: null,
    lastRequestOutcome: null,
    presence: "online",
    offlineSince: null,
    noContestAt: null,
    reviewPending: false,
    timeoutAt: null,
    weights: [],
    editOpen: false,
    editClosesAt: null,
    startBlockers: [],
    ...o,
  };
}

const seamsFor = (m: MatchDetails, viewer: string, s: TimekeeperMatchState | null = null) => {
  const roles = deriveMatchRoles(m, viewer);
  if (!roles) throw new Error("no roles");
  return stepSeams(roles, s);
};
const live = (m: MatchDetails, viewer: string, s: TimekeeperMatchState | null = null) => seamsFor(m, viewer, s).live;

const AT = "2026-10-20T12:09:00.000Z";

describe("two-athlete match", () => {
  it("ends by broadcast and carries no timekeeper seam", () => {
    const l = live(match({ tk: false }), "a-1");
    expect(l.endVia).toBe("broadcast");
    expect(l.timekeeper).toBeUndefined();
    expect(l.controls).toBe("full");
    expect(l.endedByName).toBeUndefined();
  });
});

describe("timekeeper mode", () => {
  it("an athlete never ends the clock and watches the timekeeper by short name", () => {
    const l = live(match({ tk: true }), "a-2", state({}));
    expect(l.endVia).toBeNull();
    expect(l.controls).toBe("none");
    expect(l.timekeeper).toEqual({ id: "tk-1", name: "J. Cruz", canLeave: false, offline: false, timeoutAt: null });
  });

  it("an athlete reads the timekeeper offline and the no-contest instant from the state", () => {
    const l = live(match({ tk: true }), "a-1", state({ presence: "offline", timeoutAt: AT }));
    expect(l.timekeeper).toEqual({ id: "tk-1", name: "J. Cruz", canLeave: false, offline: true, timeoutAt: AT });
  });

  it("the timekeeper ends with end_match_clock, may Leave, and never sees themselves offline", () => {
    const l = live(match({ tk: true }), "tk-1", state({ presence: "offline", timeoutAt: AT }));
    expect(l.endVia).toBe("end_match_clock");
    expect(l.controls).toBe("full");
    expect(l.timekeeper).toEqual({ id: "tk-1", name: "J. Cruz", canLeave: true, offline: false, timeoutAt: AT });
  });

  it("before the state lands: online and no countdown", () => {
    const l = live(match({ tk: true }), "a-1", null);
    expect(l.timekeeper).toEqual({ id: "tk-1", name: "J. Cruz", canLeave: false, offline: false, timeoutAt: null });
  });

  it("no seat, no timekeeper seam", () => {
    expect(live(match({ tk: true, seated: false }), "a-1", state({})).timekeeper).toBeUndefined();
  });

  it("the athletes' ended plate names the timekeeper by short name, as TK-L2 and TK-D7 do (the deck's {NAME})", () => {
    expect(live(match({ tk: true }), "a-1", state({})).endedByName).toBe("J. Cruz");
    // The timekeeper ends it themselves; nobody else's end is named on their phone.
    expect(live(match({ tk: true }), "tk-1", state({})).endedByName).toBeUndefined();
  });
});

describe("the face-off's TK-D7 before the start (spec 4.3, no chip of its own)", () => {
  const offlineName = (m: MatchDetails, viewer: string, s: TimekeeperMatchState | null) =>
    seamsFor(m, viewer, s).faceoff.timekeeperOfflineName;

  it.each([
    ["the challenger, timekeeper offline", true, "a-1", "offline", "J. Cruz"],
    ["the opponent, timekeeper offline", true, "a-2", "offline", "J. Cruz"],
    ["an athlete, timekeeper online", true, "a-1", "online", null],
    ["the timekeeper, read offline (never of themselves)", true, "tk-1", "offline", null],
  ] as const)("%s", (_name, tk, viewer, presence, expected) => {
    expect(offlineName(match({ tk }), viewer, state({ presence }))).toBe(expected);
  });

  it("before the state lands: nothing", () => {
    expect(offlineName(match({ tk: true }), "a-1", null)).toBeNull();
  });

  it("nobody seated (picking): nothing", () => {
    expect(offlineName(match({ tk: true, seated: false }), "a-1", state({ presence: "offline" }))).toBeNull();
  });

  it("a two-athlete match: nothing", () => {
    expect(offlineName(match({ tk: false }), "a-1", null)).toBeNull();
  });
});

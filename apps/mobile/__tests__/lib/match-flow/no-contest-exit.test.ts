/**
 * `noContestExit` (lib/match-flow/no-contest-exit.ts; slice M4, TEST-PLAN
 * 3.2): the reason-specific exit toast of a timekeeper-mode match, per
 * reason and viewer (spec 6.2), word for word from the copy deck: TK-W2,
 * TK-E1, TK-NC1 to TK-NC7 and TK-K17, with short names, the athletes
 * challenger first. A name it cannot know falls back to the shipped toast
 * (null) rather than print an empty one.
 */
import { noContestExit, type NoContestExitInput, type NoContestExitReason } from "@/lib/match-flow/no-contest-exit";
import type { MatchAthleteView } from "@/lib/match-flow/match-roles";

function athlete(id: string, name: string, short: string, isChallenger: boolean): MatchAthleteView {
  return {
    athleteId: id,
    displayName: name,
    shortName: short,
    currentElo: 1500,
    weightLbs: 170,
    photoUrl: null,
    outcome: null,
    eloBefore: null,
    eloAfter: null,
    eloDelta: null,
    weightDivisionGap: null,
    isChallenger,
  };
}

const REYES = athlete("a-1", "Marcus Reyes", "M. Reyes", true);
const OKAFOR = athlete("a-2", "Dana Okafor", "D. Okafor", false);
const TIMEKEEPER = { id: "tk-1", name: "Jordan Cruz", shortName: "J. Cruz" };

/** Roles as each viewer derives them (`deriveMatchRoles`): challenger first in `athletes`. */
const AS: Record<"challenger" | "opponent" | "timekeeper", NoContestExitInput["roles"]> = {
  challenger: { viewer: "challenger", me: REYES, athletes: [REYES, OKAFOR], timekeeper: TIMEKEEPER },
  opponent: { viewer: "opponent", me: OKAFOR, athletes: [REYES, OKAFOR], timekeeper: TIMEKEEPER },
  timekeeper: { viewer: "timekeeper", me: null, athletes: [REYES, OKAFOR], timekeeper: TIMEKEEPER },
};

const exit = (reason: NoContestExitReason | null, viewer: keyof typeof AS, actorId?: string | null) =>
  noContestExit({ reason, roles: AS[viewer], actorId });

describe("the athletes (spec 6.2: TK-W2, TK-NC1, TK-NC2, TK-NC4, TK-NC5, TK-NC7, TK-E1)", () => {
  it.each([
    ["no_timekeeper", "Match cancelled", "No timekeeper joined in 10 minutes."],
    ["timekeeper_left", "No contest", "J. Cruz left the match. It won't count."],
    ["timekeeper_offline", "No contest", "J. Cruz went offline. The match won't count."],
    ["admin_void", "No contest", "An admin voided M. Reyes vs D. Okafor. It won't count."],
    ["faceoff_timeout", "No contest", "The match didn't start within 10 minutes. It won't count."],
    ["pause_timeout", "No contest", "The match was paused for over 10 minutes. It won't count."],
  ] as const)("%s: %s / %s, for the challenger and the opponent alike", (reason, title, description) => {
    expect(exit(reason, "challenger")).toEqual({ title, description });
    expect(exit(reason, "opponent")).toEqual({ title, description });
  });

  it("athlete_left names the other athlete without waiting for a broadcast (TK-E1)", () => {
    expect(exit("athlete_left", "challenger")).toEqual({ title: "Match cancelled", description: "D. Okafor left the match." });
    expect(exit("athlete_left", "opponent")).toEqual({ title: "Match cancelled", description: "M. Reyes left the match." });
  });

  it("athlete_left takes the athlete a broadcast named, and ignores an id that is neither athlete", () => {
    expect(exit("athlete_left", "challenger", "a-2")?.description).toBe("D. Okafor left the match.");
    expect(exit("athlete_left", "challenger", "tk-1")?.description).toBe("D. Okafor left the match.");
    expect(exit("athlete_left", "opponent", "someone-else")?.description).toBe("M. Reyes left the match.");
  });

  it("never sees TK-K17 (only a timekeeper loses a seat)", () => {
    expect(exit("no_longer_timekeeper", "challenger")).toBeNull();
    expect(exit("no_longer_timekeeper", "opponent")).toBeNull();
  });
});

describe("the timekeeper (spec 6.2: TK-NC3 to TK-NC7, TK-E1, TK-K17)", () => {
  it.each([
    ["timekeeper_left", "No contest", "You left the match. It won't count for M. Reyes or D. Okafor."],
    ["timekeeper_offline", "No contest", "You were offline too long. M. Reyes vs D. Okafor won't count."],
    ["admin_void", "No contest", "An admin voided M. Reyes vs D. Okafor. It won't count."],
    ["faceoff_timeout", "No contest", "The match didn't start within 10 minutes. It won't count."],
    ["pause_timeout", "No contest", "The match was paused for over 10 minutes. It won't count."],
  ] as const)("%s: %s / %s", (reason, title, description) => {
    expect(exit(reason, "timekeeper")).toEqual({ title, description });
  });

  it("athlete_left names the athlete the broadcast named (TK-E1)", () => {
    expect(exit("athlete_left", "timekeeper", "a-1")).toEqual({ title: "Match cancelled", description: "M. Reyes left the match." });
    expect(exit("athlete_left", "timekeeper", "a-2")).toEqual({ title: "Match cancelled", description: "D. Okafor left the match." });
  });

  it("athlete_left with no broadcast name (or an unknown id) is the shipped toast, never an empty name", () => {
    expect(exit("athlete_left", "timekeeper")).toBeNull();
    expect(exit("athlete_left", "timekeeper", null)).toBeNull();
    expect(exit("athlete_left", "timekeeper", "tk-1")).toBeNull();
  });

  it("losing the seat is TK-K17, one line with no description", () => {
    expect(exit("no_longer_timekeeper", "timekeeper")).toEqual({
      title: "You're no longer timekeeping this match.",
      description: "",
    });
  });

  it("no_timekeeper cannot reach a seated timekeeper: the shipped toast", () => {
    expect(exit("no_timekeeper", "timekeeper")).toBeNull();
  });
});

describe("fallbacks", () => {
  it("a cancel with no reason is the shipped toast for everyone", () => {
    for (const viewer of ["challenger", "opponent", "timekeeper"] as const) expect(exit(null, viewer)).toBeNull();
  });

  it("an unknown reason (a newer server) is the shipped toast", () => {
    expect(exit("something_new" as NoContestExitReason, "challenger")).toBeNull();
  });

  it("TK-NC1 and TK-NC2 without the timekeeper's name (an older read) are the shipped toast", () => {
    const roles = { ...AS.challenger, timekeeper: null };
    expect(noContestExit({ reason: "timekeeper_left", roles })).toBeNull();
    expect(noContestExit({ reason: "timekeeper_offline", roles })).toBeNull();
  });

  it("no toast has an em dash or an exclamation mark", () => {
    const emDash = String.fromCharCode(0x2014);
    const reasons: NoContestExitReason[] = [
      "athlete_left",
      "no_timekeeper",
      "faceoff_timeout",
      "timekeeper_left",
      "timekeeper_offline",
      "pause_timeout",
      "admin_void",
      "no_longer_timekeeper",
    ];
    for (const viewer of ["challenger", "opponent", "timekeeper"] as const) {
      for (const reason of reasons) {
        const t = exit(reason, viewer, "a-1");
        if (!t) continue;
        const words = `${t.title} ${t.description}`;
        expect(words.includes(emDash) || words.includes("!")).toBe(false);
      }
    }
  });
});

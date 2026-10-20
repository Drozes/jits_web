/**
 * The capture policy (lib/match-flow/capture-policy.ts; timekeeper mode spec
 * 13, A21 to A23; ARCHITECTURE 2.1 capture rows and 2.8). The table is the
 * test: one row per role per mode, plus practice, read through
 * `capturePolicyFor` on real `deriveMatchRoles` output.
 */
import type { MatchDetails, MatchParticipant } from "@jits/shared/api/queries";
import {
  CAPTURE_POLICY,
  PRACTICE_CAPTURE,
  capturePolicyFor,
  readyPreviewShapeFor,
} from "@/lib/match-flow/capture-policy";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";

const REYES = "a-reyes";
const OKAFOR = "a-okafor";
const CRUZ = "t-cruz";

function participant(athleteId: string, name: string): MatchParticipant {
  return { athlete_id: athleteId, display_name: name } as MatchParticipant;
}

function match(overrides: Partial<MatchDetails> = {}): MatchDetails {
  return {
    id: "m-1",
    status: "pending",
    challenger_id: REYES,
    participants: [participant(REYES, "Mina Reyes"), participant(OKAFOR, "Dayo Okafor")],
    ...overrides,
  } as MatchDetails;
}

const TK = { requires_timekeeper: true, timekeeper_id: CRUZ, tk_weight_check_required: true } as Partial<MatchDetails>;

describe("the capture table (A21)", () => {
  it.each([
    ["two-athlete match, challenger", match(), REYES],
    ["two-athlete match, opponent", match(), OKAFOR],
    ["timekeeper mode, challenger", match(TK), REYES],
    ["timekeeper mode, opponent", match(TK), OKAFOR],
  ])("%s: portrait on the default lens", (_name, m, viewer) => {
    expect(capturePolicyFor(deriveMatchRoles(m, viewer)!)).toEqual({
      recordingOrientation: "portrait_locked",
      captureLens: "default",
    });
  });

  it("the seated timekeeper: portrait, preferring the ultrawide", () => {
    const roles = deriveMatchRoles(match(TK), CRUZ)!;
    expect(roles.viewer).toBe("timekeeper");
    expect(capturePolicyFor(roles)).toEqual({ recordingOrientation: "portrait_locked", captureLens: "ultrawide_preferred" });
  });

  it("does not depend on the timekeeper weight-check sub-flag", () => {
    const roles = deriveMatchRoles(match({ ...TK, tk_weight_check_required: false }), CRUZ)!;
    expect(capturePolicyFor(roles).captureLens).toBe("ultrawide_preferred");
  });

  it("practice records like an athlete (A23)", () => {
    expect(PRACTICE_CAPTURE).toEqual({ recordingOrientation: "portrait_locked", captureLens: "default" });
  });

  it("no row records landscape or rotates freely (the spec 13.6 review is a table change, not the default)", () => {
    const rows = Object.values(CAPTURE_POLICY).flatMap((byViewer) => Object.values(byViewer));
    expect(rows.every((row) => row.recordingOrientation === "portrait_locked")).toBe(true);
    // Only the timekeeper asks for the ultrawide.
    expect(rows.filter((row) => row.captureLens === "ultrawide_preferred")).toEqual([CAPTURE_POLICY.timekeeper.timekeeper]);
  });
});

describe("readyPreviewShapeFor", () => {
  it("the recorded 9:16 frame under the portrait lock, the wide card under the landscape seams", () => {
    expect(readyPreviewShapeFor("portrait_locked")).toBe("recorded");
    expect(readyPreviewShapeFor("landscape_locked")).toBe("wide");
    expect(readyPreviewShapeFor("free")).toBe("wide");
  });
});

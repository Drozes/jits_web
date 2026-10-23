/**
 * The wizard's weights (lib/match-flow/use-wizard-weights.ts, moved out of
 * the wizard unchanged): the weight checks' rated weights once both
 * athletes are in a check read, else the challenge's (which fall back to the
 * profile weights from the viewer's roles).
 */
import { renderHook } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { MatchWeightChecks } from "@jits/shared/api/match-weight-checks";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { NO_WEIGHT_CHECKS, type WeightChecksHandle } from "@/lib/match-flow/use-match-weight-checks";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockUseMatchWeights = jest.fn();
jest.mock("@/lib/match-flow/use-match-weights", () => ({
  useMatchWeights: (...a: unknown[]) => mockUseMatchWeights(...a),
}));
const mockUseMatchWeightChecks = jest.fn();
jest.mock("@/lib/match-flow/use-match-weight-checks", () => ({
  ...jest.requireActual("@/lib/match-flow/use-match-weight-checks"),
  useMatchWeightChecks: (...a: unknown[]) => mockUseMatchWeightChecks(...a),
}));

import { useWizardWeights } from "@/lib/match-flow/use-wizard-weights";

const participant = (id: string, weight: number) => ({
  athlete_id: id,
  display_name: id,
  current_elo: 1500,
  current_weight: weight,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: 0,
  weight_division_gap: null,
});
const MATCH = { id: "M1", participants: [participant("me-1", 172.5), participant("opp-1", 171.4)] } as unknown as MatchDetails;
const ROLES = deriveMatchRoles(MATCH, "me-1");
const CHALLENGE = { mine: 170, theirs: 168, rated: true };

function checks(weights: Record<string, number | null>): WeightChecksHandle {
  const state = { matchId: "M1", required: false, blocked: false, canStart: true, weights, checks: [] } as MatchWeightChecks;
  return { ...NO_WEIGHT_CHECKS, status: "ready", state };
}

function run(params: Partial<Parameters<typeof useWizardWeights>[0]> = {}) {
  return renderHook(() =>
    useWizardWeights({ matchId: "M1", challengeId: "C1", viewerId: "me-1", roles: ROLES, checksEnabled: true, ...params }),
  ).result.current;
}

beforeEach(() => {
  mockUseMatchWeights.mockReset().mockReturnValue(CHALLENGE);
  mockUseMatchWeightChecks.mockReset().mockReturnValue(NO_WEIGHT_CHECKS);
});

describe("useWizardWeights", () => {
  it("prices the challenge for the viewer, with the roles' profile weights as the stand-in", () => {
    expect(run().weights).toBe(CHALLENGE);
    expect(mockUseMatchWeights).toHaveBeenCalledWith("C1", "me-1", 172.5, 171.4);
  });

  it("before the match loads (no roles) there are no profile weights to stand in", () => {
    run({ challengeId: undefined, roles: null });
    expect(mockUseMatchWeights).toHaveBeenCalledWith(undefined, "me-1", null, null);
  });

  it("reads the weight checks only when asked", () => {
    run({ checksEnabled: false });
    expect(mockUseMatchWeightChecks).toHaveBeenCalledWith("M1", false);
    const out = run({ checksEnabled: true });
    expect(mockUseMatchWeightChecks).toHaveBeenLastCalledWith("M1", true);
    expect(out.weightChecks).toBe(NO_WEIGHT_CHECKS);
  });

  it("takes the checks' weights once both athletes are in them (a re-weigh shows without a reload)", () => {
    mockUseMatchWeightChecks.mockReturnValue(checks({ "me-1": 173, "opp-1": null }));
    expect(run().weights).toEqual({ mine: 173, theirs: null, rated: true });
  });

  it("keeps the challenge's weights while the checks miss an athlete", () => {
    mockUseMatchWeightChecks.mockReturnValue(checks({ "me-1": 173 }));
    expect(run().weights).toBe(CHALLENGE);
  });

  it("keeps the challenge's weights without roles, whatever the checks say", () => {
    mockUseMatchWeightChecks.mockReturnValue(checks({ "me-1": 173, "opp-1": 171 }));
    expect(run({ roles: null }).weights).toBe(CHALLENGE);
  });
});

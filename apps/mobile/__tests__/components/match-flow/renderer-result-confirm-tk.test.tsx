/**
 * What the step renderer hands the result and confirm steps for timekeeper
 * mode (slice M5, `result-confirm-inputs.ts`): the final clock and the stall
 * state to the result step, and, for an athlete whose result the timekeeper
 * records, the confirm's edit count and admin flag and the result as the
 * match in hand has it now (an edit changes it, A8); and the match length to
 * the confirm in both modes. A two-athlete match gets none of the rest: the
 * steps' defaults, exactly as before. The TK-RC3 notice is the confirm step's
 * own (`confirm-step-tk.test.tsx`), not the renderer's.
 *
 * The verdict's result after an edit (A8) is not M5's: the renderer's
 * verdict branch is M1's (PM27 (a) gives M5 only the result and confirm
 * spreads), so it still reads this phone's first copy of the result type
 * (jits-o47s.34).
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { MatchExtras } from "@/lib/match-flow/match-extras";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }));

const mockProps: Record<string, Record<string, unknown>> = {};
function mockProbe(name: string) {
  return (props: Record<string, unknown>) => {
    mockProps[name] = props;
    const RN = require("react-native");
    const R = require("react");
    return R.createElement(RN.View, { testID: `probe-${name}` });
  };
}
jest.mock("@/components/match-flow/countdown/live-stage", () => ({ LiveStage: mockProbe("live") }));
jest.mock("@/components/match-flow/steps/result-step", () => ({ ResultStep: mockProbe("result") }));
jest.mock("@/components/match-flow/steps/confirm-step", () => ({ ConfirmStep: mockProbe("confirm") }));
jest.mock("@/components/match-flow/steps/end-step", () => ({ EndStep: mockProbe("end") }));
jest.mock("@/components/match-flow/faceoff/faceoff-body", () => ({ FaceoffBody: mockProbe("faceoff") }));
jest.mock("@/components/match-flow/verdict/verdict-step", () => ({ VerdictStep: mockProbe("verdict") }));
jest.mock("@/components/match-flow/crew/crew-step", () => ({ CrewStep: mockProbe("crew") }));
jest.mock("@/components/match-flow/faceoff/faceoff-timekeeper", () => ({ FaceoffTimekeeper: mockProbe("faceoff-timekeeper") }));
jest.mock("@/components/match-flow/steps/timekeeper-done", () => ({ TimekeeperDone: mockProbe("timekeeper-done") }));
jest.mock("@/components/match-flow/match-upload-line", () => ({ MatchUploadLine: () => null }));
jest.mock("@/components/match-flow/match-recorder-context", () => ({ useMatchRecorder: () => ({ state: "idle" }) }));
jest.mock("@/lib/video/match-upload-store", () => ({ useMatchUpload: () => null }));

import { MatchStepRenderer } from "@/components/match-flow/match-step-renderer";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import type { MatchStep } from "@/lib/match-flow/step-router";

const p = (id: string, name: string, outcome: string | null) => ({
  athlete_id: id,
  display_name: name,
  current_elo: 1500,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome,
  elo_before: null,
  elo_after: null,
  elo_delta: 0,
  weight_division_gap: null,
});

/** ME lost to OPP (who challenged); the match in hand after the timekeeper's edit. */
function matchOf(timekeeperMode: boolean, extra: Record<string, unknown> = {}): MatchDetails {
  return {
    id: "M1",
    status: "completed",
    participants: [p("me", "Mina Park", "loss"), p("opp", "Demo Okafor", "win")],
    challenger_id: "opp",
    ...(timekeeperMode
      ? {
          requires_timekeeper: true,
          tk_weight_check_required: true,
          timekeeper_id: "tk",
          timekeeper: { id: "tk", display_name: "Jo Cruz", profile_photo_url: null },
          final_elapsed_s: 228,
          result_edit_count: 1,
          result_recorded_by_admin: false,
        }
      : {}),
    ...extra,
  } as unknown as MatchDetails;
}

const STATE = { reviewPending: true, editOpen: true, editClosesAt: null, weights: [] } as unknown as TimekeeperMatchState;

const ARMBAR = { code: "armbar", display_name: "Armbar" } as unknown as SubmissionType;
const NO_EXTRAS: MatchExtras = { winnerId: null, submissionName: null, finishTimeSeconds: null, disputeLocksAt: null, completedAt: null };
/** This phone's first copy of the result: before the edit, ME won. */
const FIRST_COPY: BroadcastResult = { result: "submission", winnerId: "me", submissionCode: "armbar", finishTimeSeconds: 61 };

function element(
  match: MatchDetails,
  viewerId: string,
  step: MatchStep,
  confirmedAthleteIds: string[],
  tkState: TimekeeperMatchState | null,
  initialFinishSeconds?: number,
  opts: { resultData?: BroadcastResult | null; extras?: Partial<MatchExtras>; submissionTypes?: SubmissionType[] } = {},
) {
  const roles = deriveMatchRoles(match, viewerId)!;
  return (
    <MatchFlowProvider match={match} roles={roles} tkState={tkState}>
      <MatchStepRenderer
        step={step}
        exitHref="/arena"
        exitLabel="Arena"
        matchId="M1"
        matchStatus={match.status}
        durationSeconds={300}
        startedAt="2026-10-20T10:00:00Z"
        pausedAt={null}
        totalPausedDuration={0}
        submissionTypes={opts.submissionTypes ?? []}
        resultData={opts.resultData === undefined ? FIRST_COPY : opts.resultData}
        ownOutcome={null}
        confirmedAthleteIds={confirmedAthleteIds}
        extras={{ ...NO_EXTRAS, ...opts.extras }}
        recording={false}
        setStep={jest.fn()}
        setResultData={jest.fn()}
        advanceToResult={jest.fn()}
        initialFinishSeconds={initialFinishSeconds}
        setFinishSeconds={jest.fn()}
        refresh={jest.fn()}
      />
    </MatchFlowProvider>
  );
}

beforeEach(() => {
  for (const k of Object.keys(mockProps)) delete mockProps[k];
});

describe("two-athlete match: nothing new reaches the steps", () => {
  it("result: no final clock, no stall", () => {
    render(element(matchOf(false), "me", "result", [], null));
    expect(mockProps.result).toMatchObject({ finalElapsedS: null, reviewPending: false, entryPolicy: "claim" });
  });

  it("confirm: the shipped confirm, this phone's result, no match length", () => {
    render(element(matchOf(false), "me", "confirm", [], null));
    expect(mockProps.confirm.timekeeperResult).toBeUndefined();
    expect(mockProps.confirm.recorderName).toBeUndefined();
    expect(mockProps.confirm.matchLengthSeconds).toBeNull();
    expect(mockProps.confirm.resultData).toEqual({ result: "submission", winnerId: "me", submissionCode: "armbar", finishTimeSeconds: 61 });
  });

  it("confirm: this phone's clock at the end is the match length (a draw rebuilt from the DB has no other)", () => {
    render(element(matchOf(false), "me", "confirm", [], null, 180));
    expect(mockProps.confirm.matchLengthSeconds).toBe(180);
  });

  it("verdict: this phone's copy stands in for what the match in hand lacks, as before", () => {
    render(element(matchOf(false), "me", "summary", ["me", "opp"], null, undefined, { submissionTypes: [ARMBAR] }));
    expect(mockProps.verdict).toMatchObject({ submissionName: "Armbar", finishTimeSeconds: 61, resultType: "submission" });
  });

  it("verdict: the match in hand's finish wins over this phone's copy, as before", () => {
    render(
      element(matchOf(false), "me", "summary", ["me", "opp"], null, undefined, {
        submissionTypes: [ARMBAR],
        extras: { submissionName: "Kimura", finishTimeSeconds: 70 },
        resultData: { result: "draw" },
      }),
    );
    // The two-athlete verdict never edits: the type is still this phone's.
    expect(mockProps.verdict).toMatchObject({ submissionName: "Kimura", finishTimeSeconds: 70, resultType: "draw" });
  });

});

describe("timekeeper mode", () => {
  it("result, the athletes: the final clock and the stall state (TK-D8)", () => {
    render(element(matchOf(true), "me", "result", [], STATE));
    expect(mockProps.result).toMatchObject({ entryPolicy: "wait", finalElapsedS: 228, reviewPending: true });
  });

  it("result, the timekeeper: the final clock and the stall state (TK-D10)", () => {
    render(element(matchOf(true), "tk", "result", [], STATE));
    expect(mockProps.result).toMatchObject({ entryPolicy: "sole", finalElapsedS: 228, reviewPending: true });
  });

  it("confirm: the edit count and admin flag, the match length, and the result the match has now", () => {
    render(element(matchOf(true), "me", "confirm", [], STATE));
    // The edit made OPP the winner; this phone's first copy (ME won) no longer stands.
    expect(mockProps.confirm.timekeeperResult).toEqual({
      editCount: 1,
      recordedByAdmin: false,
      result: { result: "submission", winnerId: "opp" },
    });
    expect(mockProps.confirm.recorderName).toBe("Jo Cruz");
    expect(mockProps.confirm.matchLengthSeconds).toBe(228);
    // This phone's copy still goes in: the step stands it in until the result is read.
    expect(mockProps.confirm.resultData).toEqual({ result: "submission", winnerId: "me", submissionCode: "armbar", finishTimeSeconds: 61 });
  });

  it("confirm: the server's final clock wins over this phone's reading", () => {
    render(element(matchOf(true), "me", "confirm", [], STATE, 230));
    expect(mockProps.confirm.matchLengthSeconds).toBe(228);
  });

  it("confirm: an admin's record", () => {
    render(element(matchOf(true, { result_recorded_by_admin: true, result_edit_count: 0 }), "me", "confirm", [], STATE));
    expect(mockProps.confirm.timekeeperResult).toMatchObject({ editCount: 0, recordedByAdmin: true });
  });

  it("confirm: before the result is read, this phone's copy stands in", () => {
    const unread = matchOf(true, { participants: [p("me", "Mina Park", null), p("opp", "Demo Okafor", null)] });
    render(element(unread, "me", "confirm", [], STATE));
    expect(mockProps.confirm.timekeeperResult).toMatchObject({ editCount: 1, result: null });
    expect(mockProps.confirm.resultData).toEqual({ result: "submission", winnerId: "me", submissionCode: "armbar", finishTimeSeconds: 61 });
  });

  it("the verdict is the athletes' only: the timekeeper's summary is the done screen, whatever the result's state", () => {
    const clear = () => {
      for (const k of Object.keys(mockProps)) delete mockProps[k];
    };
    for (const status of ["completed", "disputed", "voided"]) {
      clear();
      const tk = render(element(matchOf(true, { status }), "tk", "summary", [], STATE));
      expect([status, mockProps["timekeeper-done"] != null, mockProps.verdict != null]).toEqual([status, true, false]);
      tk.unmount();
      clear();
      const athlete = render(element(matchOf(true, { status }), "me", "summary", ["me", "opp"], STATE));
      expect([status, mockProps.verdict != null, mockProps["timekeeper-done"] != null]).toEqual([status, true, false]);
      athlete.unmount();
    }
  });

  it.todo("verdict after an edit reads the match in hand's result type (A8): the renderer's verdict branch is M1's (jits-o47s.34)");

  it("verdict before the match in hand has a result: this phone's copy stands in", () => {
    const unread = matchOf(true, { participants: [p("me", "Mina Park", null), p("opp", "Demo Okafor", null)] });
    render(element(unread, "me", "summary", ["me", "opp"], STATE, undefined, { submissionTypes: [ARMBAR] }));
    expect(mockProps.verdict).toMatchObject({ submissionName: "Armbar", finishTimeSeconds: 61, resultType: "submission" });
  });

});

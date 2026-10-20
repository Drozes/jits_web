/**
 * The step renderer routes each (step, role) and feeds the policy seams from
 * `roles.caps` (timekeeper mode M1; ARCHITECTURE 2.3): a two-athlete match
 * passes exactly the seams' defaults, a timekeeper-mode athlete gets the
 * read-only live screen named after the timekeeper, the waiting result and
 * the timekeeper-recorded confirm (straight from the live clock's end to the
 * waiting view, spec 6.2), and the timekeeper gets their own
 * face-off, the two athletes challenger first on their rated weights from the
 * timekeeper-mode state (PM26, never the profile weights) on the face-off,
 * the live screen and the result form, the sole result entry and the done
 * screen. Every step component is a probe that records its props; the real
 * live bars and result form on those weights are pinned by
 * `timekeeper-rated-weights-render.test.tsx`.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

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

const p = (id: string, name: string) => ({
  athlete_id: id,
  display_name: name,
  current_elo: 1500,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: 0,
  weight_division_gap: null,
});

/** ME is listed second; OPP challenged. */
function matchOf(timekeeperMode: boolean): MatchDetails {
  return {
    id: "M1",
    status: "in_progress",
    participants: [p("me", "Mina Park"), p("opp", "Demo Okafor")],
    challenger_id: "opp",
    ...(timekeeperMode
      ? {
          requires_timekeeper: true,
          tk_weight_check_required: true,
          timekeeper_id: "tk",
          timekeeper: { id: "tk", display_name: "Jo Cruz", profile_photo_url: null },
        }
      : {}),
  } as unknown as MatchDetails;
}

/**
 * The timekeeper-mode state with the rated weights (BE-G3): the challenge's,
 * after a face-off re-weigh, so neither equals the profile's 170.
 */
const RATED: TimekeeperMatchState = {
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
  weights: [
    { athleteId: "opp", weight: 168.5 },
    { athleteId: "me", weight: 174 },
  ],
  editOpen: false,
  editClosesAt: null,
  startBlockers: [],
};

function renderAs(viewerId: string, timekeeperMode: boolean, step: MatchStep, tkState: TimekeeperMatchState | null = null) {
  for (const k of Object.keys(mockProps)) delete mockProps[k];
  const match = matchOf(timekeeperMode);
  const roles = deriveMatchRoles(match, viewerId)!;
  const setStep = jest.fn();
  const refresh = jest.fn();
  const screen = render(
    <MatchFlowProvider match={match} roles={roles} tkState={tkState}>
      <MatchStepRenderer
        step={step}
        exitHref="/arena"
        exitLabel="Arena"
        matchId="M1"
        matchStatus="in_progress"
        durationSeconds={300}
        startedAt="2026-10-20T10:00:00Z"
        pausedAt={null}
        totalPausedDuration={0}
        submissionTypes={[]}
        resultData={null}
        ownOutcome={null}
        confirmedAthleteIds={[]}
        extras={{ winnerId: null, submissionName: null, finishTimeSeconds: null, disputeLocksAt: null, completedAt: null }}
        recording
        matchWeights={{ mine: 171, theirs: 168 }}
        setStep={setStep}
        setResultData={jest.fn()}
        advanceToResult={jest.fn()}
        setFinishSeconds={jest.fn()}
        refresh={refresh}
      />
    </MatchFlowProvider>,
  );
  return { screen, setStep, refresh };
}

const ids = (v: unknown) => (v as { athleteId: string }).athleteId;
const weightOf = (v: unknown) => (v as { weightLbs: number | null }).weightLbs;

describe("two-athlete match: the seams get their defaults", () => {
  it("live: full controls, the opponent ends it, the shipped caption", () => {
    renderAs("me", false, "live");
    expect(mockProps.live).toMatchObject({ controls: "full", myWeight: 171, opponentWeight: 168 });
    expect(mockProps.live.endedByName).toBeUndefined();
    expect(mockProps.live.countdownCaption).toBeUndefined();
    expect(ids(mockProps.live.me)).toBe("me");
    expect(ids(mockProps.live.opponent)).toBe("opp");
  });

  it("result: claim-first chips, no named recorder", () => {
    renderAs("me", false, "result");
    expect(mockProps.result).toMatchObject({ entryPolicy: "claim", submissionLayout: "chips" });
    expect(mockProps.result.recorderName).toBeUndefined();
  });

  it("confirm: the shipped header reading (no recorder name)", () => {
    renderAs("me", false, "confirm");
    expect(mockProps.confirm.recorderName).toBeUndefined();
  });

  it("face-off and verdict for the athlete pair", () => {
    renderAs("me", false, "weight");
    expect(ids(mockProps.faceoff.me)).toBe("me");
    renderAs("me", false, "summary");
    expect(ids(mockProps.verdict.opponent)).toBe("opp");
  });

  it("the live clock's end goes to the end step", () => {
    const { setStep } = renderAs("me", false, "live");
    (mockProps.live.onEnded as (s: number) => void)(120);
    expect(setStep).toHaveBeenLastCalledWith("end");
  });

  it("a recorded result the server confirmed goes to the verdict; otherwise to confirm", () => {
    const { setStep, refresh } = renderAs("me", false, "result");
    const onRecorded = mockProps.result.onRecorded as (r: unknown, m: { recorderConfirmed: boolean }) => void;
    onRecorded({ result: "draw" }, { recorderConfirmed: false });
    expect(setStep).toHaveBeenLastCalledWith("confirm");
    onRecorded({ result: "draw" }, { recorderConfirmed: true });
    expect(setStep).toHaveBeenLastCalledWith("summary");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("timekeeper mode: an athlete", () => {
  it("crew: the picker", () => {
    renderAs("me", true, "crew");
    expect(mockProps.crew).toEqual({ matchId: "M1", exitHref: "/arena" });
  });

  it("live: read-only, the timekeeper ends it, all three phones count down", () => {
    renderAs("me", true, "live");
    expect(mockProps.live).toMatchObject({
      controls: "none",
      endedByName: "Jo Cruz",
      countdownCaption: "SYNCED TO SERVER CLOCK · ALL PHONES",
    });
    expect(ids(mockProps.live.me)).toBe("me");
  });

  it("the live clock's end goes straight to the waiting view (no 'record the result' end screen)", () => {
    const { setStep } = renderAs("me", true, "live");
    (mockProps.live.onEnded as (s: number) => void)(120);
    expect(setStep).toHaveBeenLastCalledWith("result");
  });

  it("result: waits for the timekeeper, no take-over", () => {
    renderAs("me", true, "result");
    expect(mockProps.result).toMatchObject({ entryPolicy: "wait", recorderName: "Jo Cruz", submissionLayout: "chips" });
  });

  it("confirm: names the timekeeper as the recorder", () => {
    renderAs("me", true, "confirm");
    expect(mockProps.confirm.recorderName).toBe("Jo Cruz");
  });

  it("face-off and verdict are the athletes' own", () => {
    renderAs("me", true, "ready");
    expect(mockProps.faceoff.phase).toBe("ready");
    renderAs("me", true, "summary");
    expect(mockProps.verdict).toBeDefined();
  });

  it("live: their own match weights, as before, whatever the timekeeper-mode state holds", () => {
    renderAs("me", true, "live", RATED);
    expect(mockProps.live).toMatchObject({ myWeight: 171, opponentWeight: 168 });
  });
});

describe("timekeeper mode: the timekeeper", () => {
  it("weight and ready: their own face-off, with the rated weights challenger first (PM26)", () => {
    for (const step of ["weight", "ready"] as const) {
      renderAs("tk", true, step, RATED);
      expect(mockProps["faceoff-timekeeper"]).toEqual({
        matchId: "M1",
        durationSeconds: 300,
        exitHref: "/arena",
        ratedWeights: [
          { athleteId: "opp", lbs: 168.5 },
          { athleteId: "me", lbs: 174 },
        ],
      });
      expect(mockProps.faceoff).toBeUndefined();
    }
  });

  it("face-off: no rated weight is no weight, never the profile's (verdicts quote it)", () => {
    // The state not read yet.
    renderAs("tk", true, "weight");
    expect(mockProps["faceoff-timekeeper"].ratedWeights).toEqual([
      { athleteId: "opp", lbs: null },
      { athleteId: "me", lbs: null },
    ]);
    // Read, but the challenge holds no weight for one side (or an older backend sent none).
    renderAs("tk", true, "weight", { ...RATED, weights: [{ athleteId: "me", weight: 174 }] });
    expect(mockProps["faceoff-timekeeper"].ratedWeights).toEqual([
      { athleteId: "opp", lbs: null },
      { athleteId: "me", lbs: 174 },
    ]);
  });

  it("live: the controls, the two athletes challenger first on their rated weights (PM26)", () => {
    renderAs("tk", true, "live", RATED);
    expect(mockProps.live).toMatchObject({ controls: "full", countdownCaption: "SYNCED TO SERVER CLOCK · ALL PHONES" });
    expect(mockProps.live.endedByName).toBeUndefined();
    expect(ids(mockProps.live.me)).toBe("opp");
    expect(ids(mockProps.live.opponent)).toBe("me");
    // Not the profile weights (170 each), nor the wizard's athlete weights
    // (171 / 168): the countdown chip's weights...
    expect(mockProps.live).toMatchObject({ myWeight: 168.5, opponentWeight: 174 });
    // ...and the athletes the live screen's bars render after GO.
    expect(weightOf(mockProps.live.me)).toBe(168.5);
    expect(weightOf(mockProps.live.opponent)).toBe(174);
  });

  it("live: no rated weight is no weight, never the profile's", () => {
    renderAs("tk", true, "live");
    expect(mockProps.live).toMatchObject({ myWeight: null, opponentWeight: null });
    expect(weightOf(mockProps.live.me)).toBeNull();
    expect(weightOf(mockProps.live.opponent)).toBeNull();
    // A side the challenge holds no weight for stays empty; the other is rated.
    renderAs("tk", true, "live", { ...RATED, weights: [{ athleteId: "me", weight: 174 }] });
    expect(mockProps.live).toMatchObject({ myWeight: null, opponentWeight: 174 });
    expect(weightOf(mockProps.live.me)).toBeNull();
    expect(weightOf(mockProps.live.opponent)).toBe(174);
  });

  it("result: the form's athletes are on their rated weights, never the profile's (PM26)", () => {
    renderAs("tk", true, "result", RATED);
    expect(weightOf(mockProps.result.me)).toBe(168.5);
    expect(weightOf(mockProps.result.opponent)).toBe(174);
    renderAs("tk", true, "result");
    expect(weightOf(mockProps.result.me)).toBeNull();
    expect(weightOf(mockProps.result.opponent)).toBeNull();
  });

  it("an athlete's live and result pair keeps the shipped profile weights, whatever the state holds", () => {
    for (const timekeeperMode of [false, true]) {
      renderAs("me", timekeeperMode, "live", timekeeperMode ? RATED : null);
      expect(weightOf(mockProps.live.me)).toBe(170);
      expect(weightOf(mockProps.live.opponent)).toBe(170);
      renderAs("me", timekeeperMode, "result", timekeeperMode ? RATED : null);
      expect(weightOf(mockProps.result.me)).toBe(170);
      expect(weightOf(mockProps.result.opponent)).toBe(170);
    }
  });

  it("result: the sole recorder on the full list, then the done screen (never confirm)", () => {
    const { setStep, refresh } = renderAs("tk", true, "result");
    expect(mockProps.result).toMatchObject({ entryPolicy: "sole", submissionLayout: "list" });
    expect(ids(mockProps.result.me)).toBe("opp");
    const onRecorded = mockProps.result.onRecorded as (r: unknown, m: { recorderConfirmed: boolean }) => void;
    onRecorded({ result: "draw" }, { recorderConfirmed: false });
    expect(setStep).toHaveBeenLastCalledWith("summary");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("confirm and summary: the done screen, whose Done exits to Home, not the route's exit (spec 4.2)", () => {
    for (const step of ["confirm", "summary"] as const) {
      renderAs("tk", true, step);
      expect(mockProps["timekeeper-done"]).toMatchObject({ matchId: "M1", exitHref: "/", durationSeconds: 300 });
      // `Done` is TK-R4; the route's exit label ("Back to Arena") is not passed.
      expect(mockProps["timekeeper-done"]).not.toHaveProperty("exitLabel");
      expect(mockProps.verdict).toBeUndefined();
      expect(mockProps.confirm).toBeUndefined();
    }
  });

  it("end: the shared end step, which the live clock's end goes to", () => {
    const { setStep } = renderAs("tk", true, "live");
    (mockProps.live.onEnded as (s: number) => void)(120);
    expect(setStep).toHaveBeenLastCalledWith("end");
    renderAs("tk", true, "end");
    expect(mockProps.end).toBeDefined();
  });
});

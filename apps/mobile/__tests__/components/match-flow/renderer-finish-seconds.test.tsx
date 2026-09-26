/**
 * The match step renderer hands the live step's clock reading up to the
 * wizard (setFinishSeconds) as it advances to "end", and passes the stored
 * reading down to the result step as initialFinishSeconds.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockResultProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("@/components/match-flow/steps/live-step", () => ({
  LiveStep: ({ onEnded }: { onEnded: (s: number) => void }) => {
    const RN = require("react-native");
    const R = require("react");
    return R.createElement(
      RN.Pressable,
      { testID: "fake-end", onPress: () => onEnded(95) },
      R.createElement(RN.Text, null, "end"),
    );
  },
}));
jest.mock("@/components/match-flow/steps/result-step", () => ({
  ResultStep: (props: Record<string, unknown>) => {
    mockResultProps.current = props;
    return null;
  },
}));
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  useMatchRecorder: () => ({ state: "idle" }),
}));
jest.mock("@/lib/video/match-upload-store", () => ({ useMatchUpload: () => null }));
jest.mock("@/components/match-flow/steps/weight-step", () => ({}));
jest.mock("@/components/match-flow/steps/ready-step", () => ({}));
jest.mock("@/components/match-flow/steps/end-step", () => ({}));
jest.mock("@/components/match-flow/steps/confirm-step", () => ({}));
jest.mock("@/components/match-flow/steps/summary-step", () => ({}));
jest.mock("@/components/match-flow/steps/wait-step", () => ({}));

import { MatchStepRenderer } from "@/components/match-flow/match-step-renderer";

const participant = (id: string) => ({
  athlete_id: id,
  display_name: id,
  current_elo: null,
  current_weight: null,
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: null,
  weight_division_gap: null,
});

function renderStep(
  step: "live" | "result",
  extra: { initialFinishSeconds?: number } = {},
) {
  const setStep = jest.fn();
  const setFinishSeconds = jest.fn();
  const s = render(
    <MatchStepRenderer
      step={step}
      exitHref="/arena"
      exitLabel="Arena"
      matchId="M1"
      matchType="ranked"
      matchStatus="in_progress"
      durationSeconds={300}
      startedAt={new Date().toISOString()}
      pausedAt={null}
      totalPausedDuration={0}
      me={participant("me")}
      opponent={participant("opp")}
      submissionTypes={[]}
      resultData={null}
      ownOutcome={null}
      confirmedAthleteIds={[]}
      setStep={setStep}
      setStartedAt={jest.fn()}
      setResultData={jest.fn()}
      advanceToResult={jest.fn()}
      setFinishSeconds={setFinishSeconds}
      refresh={jest.fn()}
      onCancelledRemotely={jest.fn()}
      {...extra}
    />,
  );
  return { ...s, setStep, setFinishSeconds };
}

describe("MatchStepRenderer finish seconds", () => {
  it("stores the live step's clock reading and advances to end", () => {
    const { getByTestId, setStep, setFinishSeconds } = renderStep("live");
    fireEvent.press(getByTestId("fake-end"));
    expect(setFinishSeconds).toHaveBeenCalledWith(95);
    expect(setStep).toHaveBeenCalledWith("end");
  });

  it("passes the stored reading to the result step", () => {
    renderStep("result", { initialFinishSeconds: 95 });
    expect(mockResultProps.current?.initialFinishSeconds).toBe(95);
  });

  it("passes nothing when there is no reading (cold start into result)", () => {
    renderStep("result");
    expect(mockResultProps.current?.initialFinishSeconds).toBeUndefined();
  });
});

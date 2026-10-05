/**
 * The compact line under End / Result / Confirm (jits-n2im.2 AC2, deck
 * section 3, board P-VS-02), and the wizard's strip rules (AC3): the line
 * shows on those three steps, never on the countdown / live, and the live
 * step hides the app-wide strip for every job.
 */
const mockRetry = jest.fn();
jest.mock("@/lib/video/use-upload-actions", () => {
  const actual = jest.requireActual("@/lib/video/use-upload-actions");
  return { ...actual, useUploadActions: () => ({ retry: mockRetry, discard: jest.fn() }) };
});
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  useMatchRecorder: () => ({ state: "idle", error: null }),
}));
jest.mock("@/components/match-flow/steps/end-step", () => ({ EndStep: () => null }));
jest.mock("@/components/match-flow/steps/result-step", () => ({ ResultStep: () => null }));
jest.mock("@/components/match-flow/steps/confirm-step", () => ({ ConfirmStep: () => null }));
jest.mock("@/components/match-flow/steps/wait-step", () => ({ WaitStep: () => null }));
jest.mock("@/components/match-flow/faceoff/faceoff-body", () => ({ FaceoffBody: () => null }));
jest.mock("@/components/match-flow/countdown/live-stage", () => ({ LiveStage: () => null }));
jest.mock("@/components/match-flow/verdict/verdict-step", () => ({ VerdictStep: () => null }));

import * as React from "react";
import { StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { MatchUploadLine } from "@/components/match-flow/match-upload-line";
import { MatchStepRenderer } from "@/components/match-flow/match-step-renderer";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { __resetStripSuppressionsForTests, getStripSuppressions } from "@/lib/video/upload-strip-visibility";
import type { MatchStep } from "@/lib/match-flow/step-router";

beforeEach(() => {
  mockRetry.mockReset();
  resetMatchUploadStore();
  __resetStripSuppressionsForTests();
});

describe("MatchUploadLine", () => {
  it("renders nothing without a recording", () => {
    expect(render(<MatchUploadLine matchId="m1" />).queryByTestId("match-upload-line")).toBeNull();
  });

  it("uploading: one progressbar line with the percent", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.42 });
    });
    const s = render(<MatchUploadLine matchId="m1" />);
    expect(s.getByText("YOUR ANGLE: UPLOADING")).toBeTruthy();
    expect(s.getByText("42%")).toBeTruthy();
    expect(s.getByTestId("match-upload-line").props.accessibilityRole).toBe("progressbar");
  });

  it("paused and retryable failures are a 44 px Try again", () => {
    act(() => {
      setMatchUpload("m1", { status: "error", errorClass: "offline", error: "x" });
    });
    const s = render(<MatchUploadLine matchId="m1" />);
    const line = s.getByTestId("match-upload-line");
    expect(line.props.accessibilityLabel).toBe("Your angle: didn't upload. Try again");
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ minHeight: 44 });
    fireEvent.press(line);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("a terminal failure is grey text with nothing to press", () => {
    act(() => {
      setMatchUpload("m1", { status: "error", errorClass: "file_missing", error: "x" });
    });
    const s = render(<MatchUploadLine matchId="m1" />);
    expect(s.getByTestId("match-upload-line").props.accessibilityRole).toBeUndefined();
  });
});

describe("MatchStepRenderer and the upload status", () => {
  const participant = { athlete_id: "a", display_name: "A", current_elo: 1, current_weight: 1, outcome: null, elo_before: null, elo_after: null, elo_delta: null, weight_division_gap: null };
  const props = (step: MatchStep) =>
    ({
      step,
      exitHref: "/",
      exitLabel: "Back",
      matchId: "m1",
      matchStatus: "in_progress",
      durationSeconds: 300,
      startedAt: new Date().toISOString(),
      pausedAt: null,
      totalPausedDuration: 0,
      me: participant,
      opponent: { ...participant, athlete_id: "b" },
      submissionTypes: [],
      resultData: null,
      ownOutcome: null,
      confirmedAthleteIds: [],
      extras: {},
      recording: true,
      setStep: jest.fn(),
      setResultData: jest.fn(),
      advanceToResult: jest.fn(),
      setFinishSeconds: jest.fn(),
      refresh: jest.fn(),
    }) as unknown as React.ComponentProps<typeof MatchStepRenderer>;

  beforeEach(() => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.3 });
    });
  });

  it.each(["end", "result", "confirm"] as const)("%s shows the compact line and hides the strip for this match only", (step) => {
    const s = render(<MatchStepRenderer {...props(step)} />);
    expect(s.getByTestId("match-upload-line")).toBeTruthy();
    expect(getStripSuppressions()).toEqual([{ kind: "match", matchId: "m1" }]);
  });

  it("live (countdown and the live screen): no line, and the strip hides for every job", () => {
    const s = render(<MatchStepRenderer {...props("live")} />);
    expect(s.queryByTestId("match-upload-line")).toBeNull();
    expect(getStripSuppressions()).toEqual([{ kind: "all" }]);
  });
});

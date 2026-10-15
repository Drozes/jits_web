/**
 * A clip parked for AI processing consent (jits-rog5.11), at the UI: the
 * sweep surfaces it as `needs_consent` (pinned in the manager suite), the
 * compact upload line offers Try again, Try again asks "Before you upload",
 * and Allow records consent and runs the upload.
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockGive = jest.fn();
jest.mock("@/lib/moderation/ai-consent", () => ({ giveAiConsent: () => mockGive() }));

import { MatchUploadLine } from "@/components/match-flow/match-upload-line";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { describeUploadFailure } from "@/lib/video/upload-errors";
import { __setUploadControl, type RetryMatchUploadResult } from "@/lib/video/upload-control";

const mockControlRetry = jest.fn<Promise<RetryMatchUploadResult>, [string]>();

beforeEach(() => {
  jest.clearAllMocks();
  resetMatchUploadStore();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  __setUploadControl({
    retry: (id) => mockControlRetry(id),
    discard: jest.fn(),
    hasPending: jest.fn(),
    stopForSignOut: jest.fn(),
  });
  // The manager without consent answers needs_consent; once allowed, it starts.
  mockControlRetry.mockResolvedValueOnce("needs_consent").mockResolvedValue("started");
  mockGive.mockResolvedValue(true);
});

afterEach(() => __setUploadControl(null));

it("a clip waiting for consent shows Try again, which asks first and uploads on Allow", async () => {
  // What the sweep writes for a parked clip on a cold start without consent.
  act(() => {
    setMatchUpload("M1", { status: "error", errorClass: "needs_consent", error: describeUploadFailure("needs_consent").message });
  });
  const s = render(<MatchUploadLine matchId="M1" />);
  const line = s.getByTestId("match-upload-line");
  expect(line.props.accessibilityRole).toBe("button");

  await act(async () => fireEvent.press(line));
  const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe("Before you upload");

  await act(async () => (buttons as { text: string; onPress?: () => void }[])[2].onPress?.());
  expect(mockGive).toHaveBeenCalledTimes(1);
  expect(mockControlRetry).toHaveBeenCalledTimes(2);
  expect(mockControlRetry).toHaveBeenLastCalledWith("M1");
});

it("the waiting state reads as paused, never as a dead end", () => {
  const copy = describeUploadFailure("needs_consent");
  expect(copy).toMatchObject({ disposition: "paused", terminal: false });
  expect(copy.message).toBe("Allow AI processing to upload this clip. Tap Try again.");
});

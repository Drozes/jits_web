/**
 * THE DEFECT: the timekeeper wizard treated `uploadStatus === "error"` as a
 * terminal state and advanced. A failed upload therefore flashed an amber
 * line, unmounted with the step, and left the user on "Match Recorded!"
 * with no video, no error and nothing to do about it. The recording only
 * ever existed in that page's memory, so advancing destroyed it.
 *
 * These tests pin the replacement: the wizard STOPS on a failed upload and
 * offers the two real choices, and the only way past it is one of them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockRecorder = {
  videoRef: { current: null },
  isRecording: false,
  startRecording: vi.fn(async () => undefined),
  stopRecording: vi.fn(),
  uploadStatus: "idle" as "idle" | "uploading" | "done" | "error",
  error: null as string | null,
  videoId: null as string | null,
  uploadProgress: null as number | null,
  nearingLimit: false,
  canRetryUpload: false,
  retryUpload: vi.fn(),
  discardUpload: vi.fn(async () => undefined),
};

vi.mock("@/hooks/use-video-recorder", () => ({
  useVideoRecorder: () => mockRecorder,
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

vi.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: vi.fn(async () => ({ ok: false, error: {} })),
  resumeMatch: vi.fn(async () => ({ ok: false, error: {} })),
}));

vi.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    remaining: 120,
    running: true,
    paused: false,
    formatted: "02:00",
    syncFromBroadcast: vi.fn(),
  }),
}));

vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: () => ({
    broadcastTimerPaused: vi.fn(),
    broadcastTimerResumed: vi.fn(),
    broadcastMatchEnded: vi.fn(),
  }),
}));

import { TimekeeperLiveStep } from "./timekeeper-live-step";

const PROPS = {
  matchId: "M1",
  durationSeconds: 300,
  startedAt: "2026-09-21T12:00:00.000Z",
  pausedAt: null,
  totalPausedDuration: 0,
  currentAthleteId: "me-1",
};

function renderStep(onNext = vi.fn()) {
  const view = render(<TimekeeperLiveStep {...PROPS} onNext={onNext} />);
  return { onNext, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecorder.uploadStatus = "idle";
  mockRecorder.error = null;
  mockRecorder.videoId = null;
  mockRecorder.uploadProgress = null;
  mockRecorder.canRetryUpload = false;
});

describe("advancing past the live step", () => {
  it("advances with the videoId once the upload is done", async () => {
    mockRecorder.uploadStatus = "done";
    mockRecorder.videoId = "VID-1";
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));

    await waitFor(() => expect(onNext).toHaveBeenCalledWith({ videoId: "VID-1" }));
  });

  it("advances when no recording was ever made (camera denied)", async () => {
    mockRecorder.uploadStatus = "idle";
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));

    // Nothing to save, so nothing to stop for.
    await waitFor(() => expect(onNext).toHaveBeenCalledWith(undefined));
  });

  it("does NOT advance past a failed upload", async () => {
    mockRecorder.uploadStatus = "error";
    mockRecorder.error = "Upload failed: Network request failed";
    mockRecorder.canRetryUpload = true;
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));

    await waitFor(() => expect(screen.getByTestId("upload-error")).toBeTruthy());
    // The whole point: the user is still here, with the recording still in
    // memory, instead of on "Match Recorded!" with nothing.
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText(/Network request failed/)).toBeTruthy();
  });

  it("offers a retry that re-drives the upload without leaving the step", async () => {
    mockRecorder.uploadStatus = "error";
    mockRecorder.error = "Upload failed: Network request failed";
    mockRecorder.canRetryUpload = true;
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));
    await waitFor(() => expect(screen.getByTestId("upload-error")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /retry upload/i }));
    expect(mockRecorder.retryUpload).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("only moves on when the user deliberately drops the recording", async () => {
    mockRecorder.uploadStatus = "error";
    mockRecorder.error = "Upload failed: Network request failed";
    mockRecorder.canRetryUpload = true;
    const { onNext } = renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));
    await waitFor(() => expect(screen.getByTestId("upload-error")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /continue without video/i }));

    // Discarding cleans up any object that landed without a row, THEN
    // advances. Advancing without that would leave an unreachable file.
    await waitFor(() => expect(mockRecorder.discardUpload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onNext).toHaveBeenCalledWith());
  });

  it("hides the retry when the recording can no longer be re-sent", async () => {
    mockRecorder.uploadStatus = "error";
    mockRecorder.error = "Cannot upload: current athlete not loaded yet.";
    mockRecorder.canRetryUpload = false;
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));
    await waitFor(() => expect(screen.getByTestId("upload-error")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /retry upload/i })).toBeNull();
    expect(screen.getByRole("button", { name: /continue without video/i })).toBeTruthy();
  });
});

describe("upload progress", () => {
  it("shows a real percentage while uploading", async () => {
    mockRecorder.uploadStatus = "uploading";
    mockRecorder.uploadProgress = 0.42;
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));
    await waitFor(() => expect(screen.getByText(/42%/)).toBeTruthy());
  });

  it("falls back to an indeterminate label before the first offset is known", async () => {
    mockRecorder.uploadStatus = "uploading";
    mockRecorder.uploadProgress = null;
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: /end match/i }));
    await waitFor(() => expect(screen.getByText(/Uploading video…$/)).toBeTruthy());
  });
});

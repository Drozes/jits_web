/**
 * Tests for the mobile video recorder hook (lib/video/use-video-recorder.ts).
 *
 * Covers the recorder lifecycle. Note the division of labour after
 * jits-341p: retrying, backoff, resuming and persistence moved OUT of this
 * hook and into `lib/video/video-upload-manager.ts`, which is doubled here.
 * What is still this hook's job, and is what these tests pin down:
 * - jits-voh: the storage key is built ONCE per recording and handed to the
 *   manager, so every attempt and every resume reuses it.
 * - jits-a8y.13: a stop requested before the recorder reaches 'recording'
 *   (End fired on a very short match) is honored once recording starts;
 *   the clip is stopped and uploaded, not silently dropped.
 * - jits-hu0: unmounting mid-upload does not cancel the storage + DB
 *   write; only React state updates are skipped.
 */

const mockStartUpload = jest.fn();
const mockBuildVideoPath = jest.fn((..._args: unknown[]) => "M/A/111.mp4");

jest.mock("@/lib/video/upload-recording", () => ({
  buildVideoPath: (...args: unknown[]) => mockBuildVideoPath(...args),
}));

// The upload runner is a seam, not an implementation detail of this hook:
// it owns the retry loop, the backoff, the on-disk job and the store writes
// that outlive this component. Its own behaviour is covered in
// __tests__/lib/video/video-upload-manager.test.ts.
jest.mock("@/lib/video/video-upload-manager", () => ({
  startMatchVideoUpload: (...args: unknown[]) => mockStartUpload(...args),
}));

const mockGetCameraPermission = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockGetMicPermission = jest.fn(async () => ({ granted: true, canAskAgain: true }));

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [
    { granted: true, canAskAgain: true },
    jest.fn(),
    mockGetCameraPermission,
  ],
  useMicrophonePermissions: () => [
    { granted: true, canAskAgain: true },
    jest.fn(),
    mockGetMicPermission,
  ],
}));

import * as React from "react";
import { render, renderHook, act, waitFor } from "@testing-library/react-native";
import {
  getMatchUpload,
  resetMatchUploadStore,
  setMatchUpload,
} from "@/lib/video/match-upload-store";
import { useVideoRecorder } from "@/lib/video/use-video-recorder";
import {
  CAMERA_READY_TIMEOUT_MS,
  STOP_WATCHDOG_MS,
  WORST_CASE_START_DELAY_SECONDS,
  computeMaxRecordingSeconds,
} from "@/lib/video/recording-limits";

interface FakeCamera {
  recordAsync: jest.Mock;
  stopRecording: jest.Mock;
}

/**
 * recordAsync resolves with the clip URI only once stopRecording fires.
 * Pass `null` to simulate a recording that produced no clip.
 */
function makeFakeCamera(uri: string | null = "file://clip.mp4"): FakeCamera {
  let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
  const recordAsync = jest.fn(
    () =>
      new Promise<{ uri: string } | undefined>((res) => {
        resolveRecord = res;
      }),
  );
  const stopRecording = jest.fn(() => {
    resolveRecord?.(uri ? { uri } : undefined);
  });
  return { recordAsync, stopRecording };
}

/**
 * A camera that IGNORES the first `ignoreFirst` stopRecording() calls,
 * simulating real hardware dropping a stop issued before native capture
 * has begun (jits-a8y.13 hardening). Later stops resolve the clip.
 */
function makeStubbornCamera(ignoreFirst: number, uri = "file://clip.mp4"): FakeCamera {
  let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
  let stopCalls = 0;
  const recordAsync = jest.fn(
    () =>
      new Promise<{ uri: string } | undefined>((res) => {
        resolveRecord = res;
      }),
  );
  const stopRecording = jest.fn(() => {
    stopCalls += 1;
    if (stopCalls > ignoreFirst) resolveRecord?.({ uri });
  });
  return { recordAsync, stopRecording };
}

/**
 * A camera whose recordAsync REJECTS with the iOS "not ready" error for the
 * first `failFirst` attempts, then records normally. Mirrors the live iOS 26
 * behavior where onCameraReady fires before the session can record.
 */
function makeNotReadyCamera(failFirst: number, uri = "file://clip.mp4"): FakeCamera {
  let attempts = 0;
  let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
  const recordAsync = jest.fn(() => {
    attempts += 1;
    if (attempts <= failFirst) {
      return Promise.reject(
        new Error("Camera is not ready yet. Wait for 'onCameraReady' callback"),
      );
    }
    return new Promise<{ uri: string } | undefined>((res) => {
      resolveRecord = res;
    });
  });
  const stopRecording = jest.fn(() => {
    resolveRecord?.({ uri });
  });
  return { recordAsync, stopRecording };
}

type ManagerOutcome =
  | { ok: true; videoId: string }
  | { ok: false; error: string; willRetryLater: boolean };

const UPLOAD_OK: ManagerOutcome = { ok: true, videoId: "VID" };

/**
 * What the real manager does on success: write the outcome to the
 * match-keyed store (the hook reads `videoId` from there, not from the
 * return value) and resolve.
 */
async function uploadSucceeds({
  matchId,
  storagePath,
}: {
  matchId: string;
  storagePath: string;
}): Promise<ManagerOutcome> {
  setMatchUpload(matchId, {
    status: "uploaded",
    videoId: "VID",
    storagePath,
    error: null,
    progress: 1,
  });
  return UPLOAD_OK;
}

/** What the real manager does when it has given up. It never throws. */
async function uploadFails({ matchId }: { matchId: string }): Promise<ManagerOutcome> {
  setMatchUpload(matchId, { status: "error", error: "Upload failed: network died" });
  return { ok: false, error: "Upload failed: network died", willRetryLater: false };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Module-level by design: reset it or one test's upload outcome leaks
  // into the next through the shared matchId.
  resetMatchUploadStore();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
  jest.useRealTimers();
});

describe("useVideoRecorder", () => {
  it("builds the storage key ONCE and hands it to the upload runner (jits-voh)", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.videoId).toBe("VID");
    // One key per RECORDING, not per attempt. Every retry and every resume
    // inside the manager reuses it, so a half-written object is overwritten
    // rather than stranded at a dead path, and a resumable upload does not
    // lose the bytes the server already holds.
    expect(mockBuildVideoPath).toHaveBeenCalledTimes(1);
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(mockStartUpload).toHaveBeenCalledWith({
      matchId: "M",
      uploaderAthleteId: "A",
      fileUri: "file://clip.mp4",
      storagePath: "M/A/111.mp4",
      truncation: null,
    });
  });

  it("does not retry the upload itself, because the runner owns that", async () => {
    // The old hook fired two attempts back to back with no delay, so a
    // flaky link burned both within seconds. Retrying is now the manager's
    // job, with jittered backoff and a persisted job; the hook must call it
    // exactly once and report what it says.
    mockStartUpload.mockImplementationOnce(uploadFails);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatch(/network died/);
  });

  it("does not hold 'error' for an upload the runner PARKED to resume later", async () => {
    // The runner keeps the job on disk and resumes it on the next foreground
    // or reconnect, writing its progress and outcome to the match store. A
    // recorder stuck in "error" outranked that store in the status chip, so
    // a resume that later succeeded still read as a failure.
    mockStartUpload.mockImplementationOnce(async ({ matchId }: { matchId: string }) => {
      const error = "Upload paused: offline. It will resume automatically.";
      setMatchUpload(matchId, { status: "error", error });
      return { ok: false, error, willRetryLater: true };
    });

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(mockStartUpload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(result.current.error).toBeNull();
    // The paused copy still reaches the user, through the store.
    expect(getMatchUpload("M")?.error).toMatch(/resume automatically/);
  });

  it("re-reads camera and mic permission when the app returns to the foreground", () => {
    const { AppState } = require("react-native");
    const listeners: Array<(s: string) => void> = [];
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((...args: unknown[]) => {
        listeners.push(args[1] as (s: string) => void);
        return { remove: jest.fn() } as never;
      });
    try {
      renderHook(() => useVideoRecorder("M", "A"));
      expect(listeners.length).toBeGreaterThan(0);
      act(() => listeners.forEach((l) => l("background")));
      expect(mockGetCameraPermission).not.toHaveBeenCalled();
      act(() => listeners.forEach((l) => l("active")));
      expect(mockGetCameraPermission).toHaveBeenCalled();
      expect(mockGetMicPermission).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("passes a truncation through so a resumed upload can still warn", async () => {
    // The clip is short (the OS cap fired). That fact lives on the job the
    // manager persists, so it survives the process and can still be shown
    // when the upload finally lands.
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 1));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    // recordAsync settles on its own, with no stop() ever issued.
    await act(async () => {
      cam.stopRecording();
      await startPromise;
    });

    await waitFor(() => expect(mockStartUpload).toHaveBeenCalledTimes(1));
    expect(mockStartUpload.mock.calls[0][0].truncation).toBeTruthy();
  });

  it("honors a stop requested before recording starts (jits-a8y.13)", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    // End fires while the recorder is still idle (start() not yet run).
    await act(async () => {
      await result.current.stop();
    });
    expect(cam.stopRecording).not.toHaveBeenCalled();

    // When recording finally starts, the pending stop is honored
    // immediately and the clip still uploads.
    await act(async () => {
      await result.current.start();
    });

    expect(cam.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("uploaded");
    expect(result.current.videoId).toBe("VID");
  });

  it("re-issues a pending stop the camera ignored before capture began (jits-a8y.13)", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    // Hardware can drop a stop issued before native capture is live; the
    // deferred pending-stop loop must re-issue it until recordAsync settles.
    const cam = makeStubbornCamera(1);
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    await act(async () => {
      await result.current.stop(); // pending stop while still idle
    });
    await act(async () => {
      await result.current.start();
    });

    expect(cam.stopRecording.mock.calls.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.videoId).toBe("VID");
  });

  it("cleanly goes idle when a pending stop yields no clip URI", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera(null);
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(cam.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("defers start until the camera reports ready, then records", async () => {
    // Real hardware: recordAsync before onCameraReady throws "Camera is
    // not ready yet" and the clip silently never records. start() must
    // defer and markCameraReady must resume it.
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;

    await act(async () => {
      await result.current.start();
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();

    act(() => {
      result.current.markCameraReady();
    });
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.stop();
    });
    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.videoId).toBe("VID");
  });

  it("attempts recordAsync after the backstop timeout when onCameraReady never fires", async () => {
    // Observed on iOS 26 hardware: onCameraReady sometimes never fires.
    // After CAMERA_READY_TIMEOUT_MS the deferred start must fall through
    // and probe the camera directly via the retry loop.
    jest.useFakeTimers();
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;

    // markCameraReady is never called; start() defers behind the backstop.
    await act(async () => {
      await result.current.start();
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();

    // The RUNTIME half of pinning the budget: the deferral lasts exactly
    // CAMERA_READY_TIMEOUT_MS, so raising that constant really does spend
    // that much of the match clock, which is what the cap has to cover.
    // The value itself is pinned in recording-limits.test.ts.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CAMERA_READY_TIMEOUT_MS - 1);
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(cam.recordAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.stop();
      await jest.runOnlyPendingTimersAsync();
    });
    expect(result.current.state).toBe("uploaded");
    expect(result.current.videoId).toBe("VID");
  });

  it("honors a stop that arrives while start is deferred on camera readiness", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;

    // start() defers (camera not ready); End fires while still idle.
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();

    // Camera comes up: deferred start runs and the pending stop is
    // honored, so the brief clip still records and uploads.
    act(() => {
      result.current.markCameraReady();
    });
    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(cam.recordAsync).toHaveBeenCalledTimes(1);
    expect(result.current.videoId).toBe("VID");
  });

  it("uploads a clip the OS finalized without an explicit stop (time cap / lost stop)", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
    const cam: FakeCamera = {
      recordAsync: jest.fn(
        () =>
          new Promise<{ uri: string } | undefined>((res) => {
            resolveRecord = res;
          }),
      ),
      stopRecording: jest.fn(),
    };

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(1));

    // The OS ends the recording on its own (maxDuration) — no stop() call.
    await act(async () => {
      resolveRecord?.({ uri: "file://capped.mp4" });
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(cam.stopRecording).not.toHaveBeenCalled();
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(result.current.videoId).toBe("VID");
    // The clip is saved, but this is NOT a normal completion: the match was
    // still running. It settled immediately, well inside the cap, so it is
    // classified as an interruption rather than the time limit (jits-2zpe).
    expect(result.current.truncation).toBe("interrupted");
  });

  it("retries recordAsync when the camera reports not-ready despite onCameraReady", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeNotReadyCamera(2);
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    // Two not-ready rejections retried at 500ms intervals, then recording.
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(3), {
      timeout: 4000,
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.videoId).toBe("VID");
  });

  it("abandons the not-ready retry loop when stop() arrives during the retry sleep", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    // A camera that NEVER becomes ready: every attempt rejects not-ready,
    // so start() is parked in the 500ms retry sleep when stop() lands.
    const cam = makeNotReadyCamera(Number.POSITIVE_INFINITY);
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(1));

    // End fires while the retry sleep is pending. Without the post-sleep
    // re-check the loop would issue another recordAsync attempt with no
    // stop ever issued against it: a leaked recording that runs to native
    // teardown and uploads a post-match garbage clip.
    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      await startPromise;
    });

    expect(cam.recordAsync).toHaveBeenCalledTimes(1);
    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("completes the upload even when unmounted mid-flight (jits-hu0)", async () => {
    let resolveUpload!: (v: ManagerOutcome) => void;
    let uploadSettled = false;
    mockStartUpload.mockImplementationOnce(
      () =>
        new Promise<ManagerOutcome>((res) => {
          resolveUpload = (v) => {
            uploadSettled = true;
            res(v);
          };
        }),
    );

    const { result, unmount } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe("uploading");

    // Screen goes away while the upload is still in flight. React detaches
    // refs in the MUTATION phase, so a real CameraView's handle is already
    // null before any of the hook's cleanup runs; these tests assign
    // `cameraRef` by hand, so they have to null it by hand too or they
    // model an unmount that cannot happen.
    result.current.cameraRef.current = null;
    unmount();

    // The upload chain still runs to completion (storage + DB write);
    // state setters are skipped via mountedRef, so nothing throws.
    resolveUpload(UPLOAD_OK);
    await startPromise!;
    expect(uploadSettled).toBe(true);
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
  });
});

/**
 * The recording cap used to be a hardcoded 600, exactly the backend default
 * `matches.duration_seconds`, so on a full-length match it fired BEFORE the
 * match ended: the clip was cut short, uploaded mid-match, and the later
 * real stop() no-opped. The cap is now derived from the match's own
 * duration, and the backstop firing is reported instead of passing as a
 * normal completion (jits-2zpe).
 */
describe("useVideoRecorder recording cap", () => {
  /**
   * A camera whose recordAsync never settles on its own, so the test
   * decides exactly when (and after how much wall-clock) the OS finalizes.
   */
  function makeManualCamera(): FakeCamera & {
    settle: (v: { uri: string } | undefined) => void;
  } {
    let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
    const cam = {
      recordAsync: jest.fn(
        () =>
          new Promise<{ uri: string } | undefined>((res) => {
            resolveRecord = res;
          }),
      ),
      stopRecording: jest.fn(),
      settle: (v: { uri: string } | undefined) => resolveRecord?.(v),
    };
    return cam;
  }

  async function startRecording(
    result: { current: ReturnType<typeof useVideoRecorder> },
    cam: FakeCamera,
  ) {
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(1));
  }

  it("passes a cap derived from the match duration, not the old hardcoded 600", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    const opts = cam.recordAsync.mock.calls[0][0] as { maxDuration: number };
    expect(opts.maxDuration).toBe(computeMaxRecordingSeconds(600));
    expect(result.current.maxDurationSeconds).toBe(opts.maxDuration);
    // The defect, stated as an assertion: the cap cannot race the match
    // clock, even when the camera burns its whole start-delay budget.
    expect(opts.maxDuration).toBeGreaterThan(600 + WORST_CASE_START_DELAY_SECONDS);
    expect(opts.maxDuration).not.toBe(600);

    cam.settle(undefined);
  });

  it("scales the cap with the match, so a longer match gets a longer cap", async () => {
    const short = renderHook(() => useVideoRecorder("M", "A", 300));
    const shortCam = makeManualCamera();
    await startRecording(short.result, shortCam);

    const long = renderHook(() => useVideoRecorder("M2", "A", 1800));
    const longCam = makeManualCamera();
    await startRecording(long.result, longCam);

    const shortCap = (shortCam.recordAsync.mock.calls[0][0] as { maxDuration: number }).maxDuration;
    const longCap = (longCam.recordAsync.mock.calls[0][0] as { maxDuration: number }).maxDuration;
    expect(longCap).toBeGreaterThan(shortCap);
    expect(longCap).toBeGreaterThan(1800 + WORST_CASE_START_DELAY_SECONDS);

    shortCam.settle(undefined);
    longCam.settle(undefined);
  });

  it("falls back to a cap well past any match when the duration is unknown", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    const opts = cam.recordAsync.mock.calls[0][0] as { maxDuration: number };
    expect(opts.maxDuration).toBe(computeMaxRecordingSeconds(undefined));
    expect(opts.maxDuration).toBeGreaterThan(3600);

    cam.settle(undefined);
  });

  it("reports the OS cap firing as a truncation, and still saves the clip", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);
    // Control wall-clock directly rather than through fake timers: the
    // classification is a Date.now() delta, and faking timers would also
    // disturb the hook's own retry timers.
    const nowSpy = jest.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    // The recording runs all the way to the cap and the OS finalizes it
    // with no stop() from us.
    nowSpy.mockReturnValue(t0 + result.current.maxDurationSeconds * 1000);
    await act(async () => {
      cam.settle({ uri: "file://capped.mp4" });
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.truncation).toBe("limit");
    // The clip is real, so it is still uploaded rather than discarded.
    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(result.current.videoId).toBe("VID");

    nowSpy.mockRestore();
  });

  it("distinguishes an interruption from the cap", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds);
    const nowSpy = jest.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    // A phone call two minutes in: nowhere near the cap.
    nowSpy.mockReturnValue(t0 + 120_000);
    await act(async () => {
      cam.settle({ uri: "file://interrupted.mp4" });
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.truncation).toBe("interrupted");

    nowSpy.mockRestore();
  });

  it("leaves truncation null when the match ends the recording normally", async () => {
    // The guard against a false positive: a clip that covers the whole
    // match must not warn the user that it was cut short.
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(result.current.state).toBe("uploaded"));
    expect(result.current.truncation).toBeNull();
  });

  it("does not let the real stop() pass silently after the cap already fired", async () => {
    // The old code's second half: once the cap had fired, state was past
    // 'recording' and stop() returned with nothing said anywhere.
    mockStartUpload.mockImplementationOnce(uploadSucceeds);
    const nowSpy = jest.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    nowSpy.mockReturnValue(t0 + result.current.maxDurationSeconds * 1000);
    await act(async () => {
      cam.settle({ uri: "file://capped.mp4" });
    });
    await waitFor(() => expect(result.current.state).toBe("uploaded"));

    (console.warn as jest.Mock).mockClear();
    await act(async () => {
      await result.current.stop();
    });

    const warned = (console.warn as jest.Mock).mock.calls
      .map((args: unknown[]) => args.join(" "))
      .join("\n");
    expect(warned).toMatch(/does not cover the end of the match/i);
    // And the user-facing signal survives the late stop.
    expect(result.current.truncation).toBe("limit");

    nowSpy.mockRestore();
  });

  it("reports a cap that produced NO file, instead of stranding the machine", async () => {
    // Pre-existing dead end: recordAsync settling with no URI while not
    // stopping returned without any transition(), leaving the recorder in
    // 'recording' forever with nothing on screen. It is the one path where
    // the cap could fire and the user was told nothing (jits-2zpe).
    const nowSpy = jest.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeManualCamera();
    await startRecording(result, cam);

    nowSpy.mockReturnValue(t0 + result.current.maxDurationSeconds * 1000);
    await act(async () => {
      cam.settle(undefined);
    });

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toMatch(/time limit/i);
    expect(result.current.truncation).toBe("limit");
    expect(mockStartUpload).not.toHaveBeenCalled();

    nowSpy.mockRestore();
  });
});

/**
 * The recorder now OUTLIVES the viewfinder: the wizard owns it, and the
 * camera is mounted only on the steps that need it. Two states that used
 * to be cleaned up by the live step unmounting the whole hook have to be
 * handled explicitly, or they surface as a permanent false accusation on
 * the persistent status chip.
 */
describe("useVideoRecorder camera and stop lifecycle", () => {
  it("does not claim a camera failure when the camera goes away mid-deferral", async () => {
    // A match that ends inside the camera-ready backstop: start() is
    // deferred, the step leaves live, MatchRecorderCamera unmounts and
    // React nulls cameraRef. Re-entering start() would hit "Camera not
    // ready" and, because the chip is persistent now, accuse the user of a
    // camera failure through result, confirm and summary.
    jest.useFakeTimers();

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;

    // markCameraReady is never called, so start() defers behind the backstop.
    await act(async () => {
      await result.current.start();
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();

    // The viewfinder unmounts: the surface releases the camera and React
    // nulls the ref.
    act(() => {
      result.current.releaseCamera();
      result.current.cameraRef.current = null;
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(CAMERA_READY_TIMEOUT_MS + 100);
    });

    expect(cam.recordAsync).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("releaseCamera clears readiness, so a later start cannot record on a dead ref", async () => {
    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    act(() => {
      result.current.releaseCamera();
      result.current.cameraRef.current = null;
    });

    await act(async () => {
      await result.current.start();
    });

    // It reports a real failure (a caller genuinely asked to record with no
    // camera) but it never calls recordAsync on a null ref.
    expect(cam.recordAsync).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
  });

  it("gives up on a stop the hardware never honours, instead of hanging in stopping", async () => {
    // issuePendingStop gives up after its budget. Before the watchdog there
    // was NO exit from 'stopping': the machine sat there, the chip spun
    // "Finishing recording..." forever, and the viewfinder (held open
    // through 'stopping' so the session is not torn down mid-finalize)
    // pinned the camera and the mic indicator over result and summary.
    jest.useFakeTimers();

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    // A camera whose stopRecording is simply ignored, forever.
    const cam: FakeCamera = {
      recordAsync: jest.fn(() => new Promise<{ uri: string } | undefined>(() => {})),
      stopRecording: jest.fn(),
    };
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    act(() => {
      void result.current.start();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(cam.recordAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe("stopping");

    // Still stopping just before the watchdog...
    await act(async () => {
      await jest.advanceTimersByTimeAsync(STOP_WATCHDOG_MS - 100);
    });
    expect(result.current.state).toBe("stopping");

    // ... and out of it after, with something the user can read.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/did not finish/i);
  });

  it("does not strand the machine in 'recording' when the camera is gone at stop time", async () => {
    // The viewfinder can go away while the match is still live (a backgrounded
    // app, a step that advanced early), and React detaches the ref with it.
    // stop() used to `return` here with no transition and no pending stop, so
    // the state machine sat in 'recording' with a HIDDEN banner while the OS
    // ran the clip out to its cap. start()'s own `if (!cam)` transitions;
    // this is the same failure and now reads the same way.
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(cam.recordAsync).toHaveBeenCalledTimes(1));
    expect(result.current.state).toBe("recording");

    act(() => {
      result.current.cameraRef.current = null;
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/camera closed/i);
    expect(cam.stopRecording).not.toHaveBeenCalled();

    // stoppingRef stayed false, so when the OS finally finalizes the clip it
    // is classified as a truncation (which it is: nobody stopped it at the
    // end of the match) and the clip is still uploaded rather than dropped.
    await act(async () => {
      cam.stopRecording();
    });
    await waitFor(() => expect(getMatchUpload("M")?.truncation).toBe("interrupted"));
    await waitFor(() => expect(getMatchUpload("M")?.status).toBe("uploaded"));
  });

  it("cannot release the camera from its unmount cleanup, because React detaches refs first", () => {
    // Documents why this hook has no unmount-time `stopRecording()` guard.
    // `useImperativeHandle` is real React, not a stub, so the ordering here
    // is the ordering production gets: the handle is attached and detached
    // in the MUTATION phase, before any passive effect cleanup runs. A guard
    // reading `cameraRef.current` from a passive cleanup therefore always
    // saw null and never ran. expo-camera's native teardown owns release.
    const camHandle = { recordAsync: jest.fn(), stopRecording: jest.fn() };
    const seenAtCleanup: unknown[] = [];

    const Viewfinder = React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => camHandle, []);
      return null;
    });
    Viewfinder.displayName = "Viewfinder";

    function Harness() {
      const recorder = useVideoRecorder("M", "A", 600);
      const { cameraRef } = recorder;
      // Declared after the hook's own effect, so its cleanup runs after the
      // hook's. If the ref is already null here, it was null there too.
      React.useEffect(() => {
        return () => {
          seenAtCleanup.push(cameraRef.current);
        };
      }, [cameraRef]);
      return React.createElement(Viewfinder, { ref: cameraRef });
    }

    const { unmount } = render(React.createElement(Harness));
    unmount();

    expect(seenAtCleanup).toEqual([null]);
    expect(camHandle.stopRecording).not.toHaveBeenCalled();
  });

  it("does not fire the watchdog when the stop lands normally", async () => {
    jest.useFakeTimers();
    mockStartUpload.mockImplementationOnce(uploadSucceeds);

    const { result } = renderHook(() => useVideoRecorder("M", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    act(() => {
      void result.current.start();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await result.current.stop();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.state).toBe("uploaded");

    // Long past the watchdog: a settled recording must not be clobbered
    // into an error by a timer nobody cancelled.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(STOP_WATCHDOG_MS * 2);
    });
    expect(result.current.state).toBe("uploaded");
    expect(result.current.error).toBeNull();
  });
});

/**
 * The match-keyed store entry describes ONE recording attempt (see
 * match-upload-store's docblock). Nothing in the process ever wrote
 * `truncation` or `videoId` back to null, so a second recording on the same
 * matchId, which is just re-entering an `in_progress` match from Arena or a
 * lobby, inherited the previous attempt's verdict about a clip it has
 * nothing to do with.
 */
describe("a new recording attempt supersedes the previous one on the same match", () => {
  it("does not report a COMPLETE clip as interrupted because an earlier attempt was", async () => {
    mockStartUpload.mockImplementationOnce(uploadSucceeds).mockImplementationOnce(uploadSucceeds);

    // Recorder #1: recordAsync settles on its own, with no explicit stop.
    // That is an interruption and it is written to the store.
    const first = renderHook(() => useVideoRecorder("SAME", "A", 600));
    const cam1 = makeFakeCamera();
    first.result.current.cameraRef.current = cam1 as never;
    act(() => first.result.current.markCameraReady());
    act(() => {
      void first.result.current.start();
    });
    await waitFor(() => expect(cam1.recordAsync).toHaveBeenCalledTimes(1));
    await act(async () => {
      cam1.stopRecording();
    });
    await waitFor(() => expect(getMatchUpload("SAME")?.truncation).toBe("interrupted"));
    first.result.current.cameraRef.current = null;
    first.unmount();

    // Recorder #2 on the SAME match, recording a clip that covers all of it
    // and stopping cleanly at the end.
    const second = renderHook(() => useVideoRecorder("SAME", "A", 600));
    const cam2 = makeFakeCamera();
    second.result.current.cameraRef.current = cam2 as never;
    act(() => second.result.current.markCameraReady());
    let startPromise: Promise<void>;
    act(() => {
      startPromise = second.result.current.start();
    });
    await act(async () => {
      await second.result.current.stop();
      await startPromise;
    });
    await waitFor(() => expect(second.result.current.state).toBe("uploaded"));

    // The red "Recording was interrupted. The clip stops before the end of
    // the match." banner over a clip that covers the whole match is the
    // defect: attempt 1's truncation had no way to clear.
    expect(getMatchUpload("SAME")?.truncation).toBeNull();
    expect(second.result.current.truncation).toBeNull();
  });

  it("does not offer a previous attempt's videoId beside a fresh failure", async () => {
    // This match already uploaded a clip once in this process.
    setMatchUpload("SAME", { status: "uploaded", videoId: "OLD-VID" });
    // The upload runner has exhausted its budget and given up.
    mockStartUpload.mockImplementationOnce(uploadFails);

    const { result } = renderHook(() => useVideoRecorder("SAME", "A", 600));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());
    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
      await startPromise;
    });

    await waitFor(() => expect(result.current.state).toBe("error"));
    // An "error" entry carrying a working videoId renders a failure banner
    // and a "Watch Match Video" button on the summary at the same time.
    expect(getMatchUpload("SAME")).toMatchObject({ status: "error", videoId: null });
    expect(result.current.videoId).toBeNull();
  });

  it("does NOT reset when a start never reaches the camera", async () => {
    // Nothing was recorded, so the last real outcome is still the truth
    // about this match and must stay on screen.
    setMatchUpload("SAME", { status: "uploaded", videoId: "OLD-VID", truncation: "limit" });

    const { result } = renderHook(() => useVideoRecorder("SAME", "A", 600));
    // No camera ref at all: start() bails before it commits to recording.
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("error");
    expect(getMatchUpload("SAME")).toMatchObject({
      status: "uploaded",
      videoId: "OLD-VID",
      truncation: "limit",
    });
  });
});

/**
 * Ref writes belong to the commit phase, not the render phase.
 *
 * React is free to discard or interrupt a render; a ref written during one
 * survives that, so `startRef` could be left pointing at a `start` closure
 * built from props and state that were never committed (a stale
 * `cameraPermission`, a stale `maxDurationSeconds`). The deferred-start
 * backstop calls exactly that closure, minutes later.
 *
 * The invariant is structural, so it is asserted structurally: wrap every
 * ref the hook creates and record any write that happens while its render
 * is in progress.
 */
describe("useVideoRecorder render purity", () => {
  it("writes no ref during render", () => {
    const realUseRef = React.useRef;
    const proxies = new WeakMap<object, object>();
    let rendering = false;
    let writesDuringRender = 0;

    const spy = jest
      .spyOn(React, "useRef")
      .mockImplementation(((initial: unknown) => {
        const box = realUseRef(initial) as unknown as { current: unknown };
        let proxy = proxies.get(box);
        if (!proxy) {
          proxy = new Proxy(box, {
            set(target, prop, value) {
              if (prop === "current" && rendering) writesDuringRender += 1;
              (target as Record<string | symbol, unknown>)[prop] = value;
              return true;
            },
          });
          proxies.set(box, proxy);
        }
        return proxy;
      }) as never);

    try {
      const { rerender } = renderHook(
        ({ duration }: { duration: number }) => {
          rendering = true;
          try {
            return useVideoRecorder("M", "A", duration);
          } finally {
            rendering = false;
          }
        },
        { initialProps: { duration: 600 } },
      );
      // A second render with different inputs rebuilds `start`, which is the
      // render the old code wrote to `startRef` from.
      rerender({ duration: 1800 });
    } finally {
      spy.mockRestore();
    }

    expect(writesDuringRender).toBe(0);
  });
});

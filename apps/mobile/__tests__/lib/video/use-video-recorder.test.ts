/**
 * Tests for the mobile video recorder hook (lib/video/use-video-recorder.ts).
 *
 * Covers the Phase 1 recorder lifecycle fixes:
 * - jits-voh: the once-failed upload retries against the SAME storage path
 *   (the key is built once per recording, not per attempt).
 * - jits-a8y.13: a stop requested before the recorder reaches 'recording'
 *   (End fired on a very short match) is honored once recording starts;
 *   the clip is stopped and uploaded, not silently dropped.
 * - jits-hu0: unmounting mid-upload does not cancel the storage + DB
 *   write; only React state updates are skipped.
 */

const mockUploadRecording = jest.fn();
const mockBuildVideoPath = jest.fn((..._args: unknown[]) => "M/A/111.mp4");
const mockRemoveUploadedObject = jest.fn();

jest.mock("@/lib/video/upload-recording", () => {
  // Defined inside the factory (jest.mock is hoisted above imports, so an
  // out-of-scope class would hit the TDZ). The hook and the tests both see
  // this same class via the mocked module, so instanceof checks work.
  class MatchVideoDbError extends Error {
    readonly path: string;
    readonly storageObjectPersisted: boolean;
    constructor(message: string, path: string, storageObjectPersisted: boolean) {
      super(message);
      this.name = "MatchVideoDbError";
      this.path = path;
      this.storageObjectPersisted = storageObjectPersisted;
    }
  }
  return {
    uploadRecording: (...args: unknown[]) => mockUploadRecording(...args),
    buildVideoPath: (...args: unknown[]) => mockBuildVideoPath(...args),
    removeUploadedObject: (...args: unknown[]) => mockRemoveUploadedObject(...args),
    MatchVideoDbError,
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [
    { granted: true, canAskAgain: true },
    jest.fn(),
  ],
  useMicrophonePermissions: () => [
    { granted: true, canAskAgain: true },
    jest.fn(),
  ],
}));

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { resetMatchUploadStore } from "@/lib/video/match-upload-store";
import { useVideoRecorder } from "@/lib/video/use-video-recorder";
import { MatchVideoDbError } from "@/lib/video/upload-recording";
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

const UPLOAD_OK = { path: "M/A/111.mp4", status: 200, videoId: "VID" };

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
  it("retries a failed upload with the SAME storage path (jits-voh)", async () => {
    mockUploadRecording
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(UPLOAD_OK);

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
    // The storage key is computed once and shared by both attempts.
    expect(mockBuildVideoPath).toHaveBeenCalledTimes(1);
    expect(mockUploadRecording).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockUploadRecording.mock.calls as Array<
      [{ storagePath?: string; skipCompensation?: boolean }]
    >;
    expect(firstCall[0].storagePath).toBe("M/A/111.mp4");
    expect(secondCall[0].storagePath).toBe("M/A/111.mp4");
    // Compensation is deferred to the FINAL attempt: attempt 1 must not
    // delete the uploaded object (the retry would re-upload up to 2 GB).
    expect(firstCall[0].skipCompensation).toBe(true);
    expect(secondCall[0].skipCompensation).toBeFalsy();
  });

  it("cleans up attempt 1's persisted object when the final attempt fails at the storage layer", async () => {
    // Attempt 1: storage write landed, DB write failed, compensation
    // skipped (object persisted). Attempt 2: storage-level failure, so
    // uploadRecording's internal compensation never ran. The hook's
    // final catch must remove the leftover object.
    mockUploadRecording
      .mockRejectedValueOnce(new MatchVideoDbError("db write failed", "M/A/111.mp4", true))
      .mockRejectedValueOnce(new Error("network died"));
    mockRemoveUploadedObject.mockResolvedValue(undefined);

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
    expect(mockRemoveUploadedObject).toHaveBeenCalledWith("M/A/111.mp4");
    expect(result.current.error).toMatch(/network died/);
  });

  it("does not double-compensate when the final attempt failed at the DB layer", async () => {
    // Attempt 2 reaching the DB step means uploadRecording already ran
    // its own compensation; the hook must not remove the path again.
    mockUploadRecording
      .mockRejectedValueOnce(new MatchVideoDbError("db write failed", "M/A/111.mp4", true))
      .mockRejectedValueOnce(new MatchVideoDbError("db write failed again", "M/A/111.mp4", false));

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
    expect(mockRemoveUploadedObject).not.toHaveBeenCalled();
  });

  it("honors a stop requested before recording starts (jits-a8y.13)", async () => {
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    expect(mockUploadRecording).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("uploaded");
    expect(result.current.videoId).toBe("VID");
  });

  it("re-issues a pending stop the camera ignored before capture began (jits-a8y.13)", async () => {
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    expect(mockUploadRecording).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("defers start until the camera reports ready, then records", async () => {
    // Real hardware: recordAsync before onCameraReady throws "Camera is
    // not ready yet" and the clip silently never records. start() must
    // defer and markCameraReady must resume it.
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    expect(mockUploadRecording).toHaveBeenCalledTimes(1);
    expect(result.current.videoId).toBe("VID");
    // The clip is saved, but this is NOT a normal completion: the match was
    // still running. It settled immediately, well inside the cap, so it is
    // classified as an interruption rather than the time limit (jits-2zpe).
    expect(result.current.truncation).toBe("interrupted");
  });

  it("retries recordAsync when the camera reports not-ready despite onCameraReady", async () => {
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    expect(mockUploadRecording).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("completes the upload even when unmounted mid-flight (jits-hu0)", async () => {
    let resolveUpload!: (v: typeof UPLOAD_OK) => void;
    let uploadSettled = false;
    mockUploadRecording.mockImplementationOnce(
      () =>
        new Promise<typeof UPLOAD_OK>((res) => {
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

    // Screen goes away while the upload is still in flight.
    unmount();

    // The upload chain still runs to completion (storage + DB write);
    // state setters are skipped via mountedRef, so nothing throws.
    resolveUpload(UPLOAD_OK);
    await startPromise!;
    expect(uploadSettled).toBe(true);
    expect(mockUploadRecording).toHaveBeenCalledTimes(1);
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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);
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
    expect(mockUploadRecording).toHaveBeenCalledTimes(1);
    expect(result.current.videoId).toBe("VID");

    nowSpy.mockRestore();
  });

  it("distinguishes an interruption from the cap", async () => {
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);
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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);
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
    expect(mockUploadRecording).not.toHaveBeenCalled();

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

  it("does not fire the watchdog when the stop lands normally", async () => {
    jest.useFakeTimers();
    mockUploadRecording.mockResolvedValueOnce(UPLOAD_OK);

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

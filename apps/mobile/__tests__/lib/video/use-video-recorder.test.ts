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
import { useVideoRecorder } from "@/lib/video/use-video-recorder";
import { MatchVideoDbError } from "@/lib/video/upload-recording";

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

const UPLOAD_OK = { path: "M/A/111.mp4", status: 200, videoId: "VID" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

describe("useVideoRecorder", () => {
  it("retries a failed upload with the SAME storage path (jits-voh)", async () => {
    mockUploadRecording
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(UPLOAD_OK);

    const { result } = renderHook(() => useVideoRecorder("M", "A"));
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;

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

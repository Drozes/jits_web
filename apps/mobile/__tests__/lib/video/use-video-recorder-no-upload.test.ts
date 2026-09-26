/**
 * The recorder's no-upload mode (`upload: false`), used only by the practice
 * match. The clip stays on the device: no upload, no match-upload store or
 * persistence writes, and the finished file is handed back as `localUri`.
 * A clip that settles after unmount is deleted immediately.
 */

const mockStartUpload = jest.fn();
const mockDiscard = jest.fn();

jest.mock("@/lib/video/video-upload-manager", () => ({
  startMatchVideoUpload: (...args: unknown[]) => mockStartUpload(...args),
}));

jest.mock("@/lib/video/upload-recording", () => ({
  buildVideoPath: () => "M/A/111.mp4",
}));

jest.mock("@/lib/video/recording-file", () => ({
  discardLocalClip: (...args: unknown[]) => mockDiscard(...args),
}));

jest.mock("@/lib/video/match-upload-store", () => {
  const actual = jest.requireActual("@/lib/video/match-upload-store");
  return {
    ...actual,
    setMatchUpload: jest.fn(),
    beginMatchUploadAttempt: jest.fn(),
  };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn(), jest.fn(async () => ({}))],
  useMicrophonePermissions: () => [{ granted: true, canAskAgain: true }, jest.fn(), jest.fn(async () => ({}))],
}));

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useVideoRecorder } from "@/lib/video/use-video-recorder";
import { beginMatchUploadAttempt, setMatchUpload } from "@/lib/video/match-upload-store";

function makeFakeCamera(uri = "file:///cache/practice.mp4") {
  let resolveRecord: ((v: { uri: string }) => void) | null = null;
  const recordAsync = jest.fn(
    () =>
      new Promise<{ uri: string }>((res) => {
        resolveRecord = res;
      }),
  );
  const stopRecording = jest.fn(() => resolveRecord?.({ uri }));
  return { recordAsync, stopRecording, settle: () => resolveRecord?.({ uri }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useVideoRecorder with upload: false", () => {
  it("returns the clip as localUri and never uploads or writes the upload store", async () => {
    const { result } = renderHook(() =>
      useVideoRecorder("practice", "A", 30, { upload: false }),
    );
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

    await waitFor(() => expect(result.current.localUri).toBe("file:///cache/practice.mp4"));
    expect(result.current.state).toBe("idle");
    expect(result.current.videoId).toBeNull();
    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(setMatchUpload).not.toHaveBeenCalled();
    expect(beginMatchUploadAttempt).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it("keeps an OS-interrupted clip local too, without a truncation store write", async () => {
    const { result } = renderHook(() =>
      useVideoRecorder("practice", "A", 30, { upload: false }),
    );
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    // The OS ends the recording without an explicit stop().
    await act(async () => {
      cam.settle();
      await startPromise;
    });

    expect(result.current.localUri).toBe("file:///cache/practice.mp4");
    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(setMatchUpload).not.toHaveBeenCalled();
  });

  it("deletes the clip when the recording settles after unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useVideoRecorder("practice", "A", 30, { upload: false }),
    );
    const cam = makeFakeCamera();
    result.current.cameraRef.current = cam as never;
    act(() => result.current.markCameraReady());

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    unmount();
    await act(async () => {
      cam.settle();
      await startPromise;
    });

    expect(mockDiscard).toHaveBeenCalledWith("file:///cache/practice.mp4");
    expect(mockStartUpload).not.toHaveBeenCalled();
  });

  it("still uploads when the option is omitted (default behavior unchanged)", async () => {
    mockStartUpload.mockResolvedValueOnce({ ok: true, videoId: "VID" });
    const { result } = renderHook(() => useVideoRecorder("M", "A", 30));
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

    expect(mockStartUpload).toHaveBeenCalledTimes(1);
    expect(result.current.localUri).toBeNull();
  });
});

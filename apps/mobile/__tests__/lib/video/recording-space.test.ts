/**
 * jits-n2im.6: a phone without room for the recording is told at the
 * face-off, before recording, not by a recording that fails part way.
 */
const mockFreeDisk = jest.fn<Promise<number>, []>();
jest.mock("expo-file-system/legacy", () => ({
  getFreeDiskStorageAsync: () => mockFreeDisk(),
}));

import { renderHook, waitFor } from "@testing-library/react-native";
import {
  RECORDING_BYTES_PER_SECOND,
  RECORDING_SPACE_MARGIN,
  estimateRecordingBytes,
  recordingSpaceWarning,
  useRecordingSpaceWarning,
} from "@/lib/video/recording-space";

const GB = 1024 * 1024 * 1024;

beforeEach(() => mockFreeDisk.mockReset());

describe("estimateRecordingBytes", () => {
  it("is bitrate x duration x 1.2", () => {
    expect(estimateRecordingBytes(600)).toBe(Math.ceil(600 * RECORDING_BYTES_PER_SECOND * RECORDING_SPACE_MARGIN));
  });

  it("assumes a 10-minute match when the length is unknown", () => {
    expect(estimateRecordingBytes(null)).toBe(estimateRecordingBytes(600));
  });
});

describe("recordingSpaceWarning", () => {
  it("says how much to free, in the deck's words, rounded up to a tenth of a GB", () => {
    // Needs ~687 MB, has 200 MB: free ~0.45 GB, rounded up.
    expect(recordingSpaceWarning(200 * 1024 * 1024, 600)).toBe("Not enough space on this phone to record. Free up 0.5 GB.");
    // A 2-hour cap needs ~8 GB.
    expect(recordingSpaceWarning(GB, 7200)).toBe("Not enough space on this phone to record. Free up 7.1 GB.");
  });

  it("says nothing when there is room, or when the read failed", () => {
    expect(recordingSpaceWarning(5 * GB, 600)).toBeNull();
    expect(recordingSpaceWarning(null, 600)).toBeNull();
  });
});

describe("useRecordingSpaceWarning", () => {
  it("shows the warning when recording is on and the disk is short (mocked disk API)", async () => {
    mockFreeDisk.mockResolvedValue(100 * 1024 * 1024);
    const { result } = renderHook(() => useRecordingSpaceWarning(true, 600));
    await waitFor(() => expect(result.current).toMatch(/^Not enough space on this phone to record\. Free up 0\.6 GB\.$/));
  });

  it("does not read the disk while recording is off", () => {
    const { result } = renderHook(() => useRecordingSpaceWarning(false, 600));
    expect(result.current).toBeNull();
    expect(mockFreeDisk).not.toHaveBeenCalled();
  });

  it("stays quiet when the disk read fails (advice, never a gate)", async () => {
    mockFreeDisk.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useRecordingSpaceWarning(true, 600));
    await waitFor(() => expect(mockFreeDisk).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

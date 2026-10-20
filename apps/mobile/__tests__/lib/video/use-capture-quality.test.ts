/**
 * The capture quality (lib/video/use-capture-quality.ts; timekeeper mode spec
 * 13.4, A22): the admin flag `match_capture_1080p`, read once per face-off,
 * fail-closed to 720p, and frozen for a recording in progress.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockGetFeatureFlag = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

import {
  DEFAULT_CAPTURE_QUALITY,
  MATCH_CAPTURE_1080P_FLAG,
  readCaptureQuality,
  useCaptureQuality,
} from "@/lib/video/use-capture-quality";

const ON = { ok: true, data: true };
const OFF = { ok: true, data: false };
const UNREADABLE = { ok: false, error: { code: "UNKNOWN", message: "x" } };

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => mockGetFeatureFlag.mockReset());

describe("readCaptureQuality", () => {
  it("reads the match_capture_1080p row", async () => {
    mockGetFeatureFlag.mockResolvedValue(ON);
    await expect(readCaptureQuality()).resolves.toBe("1080p");
    expect(MATCH_CAPTURE_1080P_FLAG).toBe("match_capture_1080p");
    expect(mockGetFeatureFlag).toHaveBeenCalledWith({ tag: "client" }, "match_capture_1080p");
  });

  it.each([
    ["off", { ok: true, data: false }],
    ["missing (an older backend: no row reads off)", { ok: true, data: false }],
    ["unreadable", { ok: false, error: { code: "UNKNOWN", message: "offline" } }],
  ])("%s: 720p", async (_name, res) => {
    mockGetFeatureFlag.mockResolvedValue(res);
    await expect(readCaptureQuality()).resolves.toBe("720p");
  });

  it("a throwing read: 720p", async () => {
    mockGetFeatureFlag.mockRejectedValue(new Error("boom"));
    await expect(readCaptureQuality()).resolves.toBe("720p");
  });
});

describe("useCaptureQuality", () => {
  it("720p until the flag answers ON, then 1080p", async () => {
    mockGetFeatureFlag.mockResolvedValue(ON);
    const { result } = renderHook(() => useCaptureQuality(true, false));
    expect(result.current).toBe(DEFAULT_CAPTURE_QUALITY);
    await settle();
    expect(result.current).toBe("1080p");
  });

  it("OFF or an error keeps 720p", async () => {
    for (const res of [OFF, UNREADABLE]) {
      mockGetFeatureFlag.mockResolvedValue(res);
      const { result, unmount } = renderHook(() => useCaptureQuality(true, false));
      await settle();
      expect(result.current).toBe("720p");
      unmount();
    }
  });

  it("reads once, when the face-off starts, and never again for this viewfinder", async () => {
    mockGetFeatureFlag.mockResolvedValue(OFF);
    const { rerender } = renderHook(({ active }: { active: boolean }) => useCaptureQuality(active, false), {
      initialProps: { active: false },
    });
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    rerender({ active: true });
    await settle();
    // An admin flips the flag mid-match: this viewfinder does not read again.
    mockGetFeatureFlag.mockResolvedValue(ON);
    rerender({ active: false });
    rerender({ active: true });
    await settle();
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it("frozen once the match is live: an answer that lands later never changes a recording in progress", async () => {
    let answer: (v: unknown) => void = () => undefined;
    mockGetFeatureFlag.mockReturnValue(new Promise((res) => (answer = res)));
    const { result, rerender } = renderHook(({ locked }: { locked: boolean }) => useCaptureQuality(true, locked), {
      initialProps: { locked: false },
    });
    rerender({ locked: true });
    // Unlocked again after the clip (the result step): still frozen.
    rerender({ locked: false });
    await act(async () => {
      answer(ON);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBe("720p");
  });

  it("first active while already locked (re-entering a live match): no read, 720p (jits-o47s.14)", async () => {
    mockGetFeatureFlag.mockResolvedValue(ON);
    const { result } = renderHook(() => useCaptureQuality(true, true));
    await settle();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    expect(result.current).toBe("720p");
  });

  it("a value resolved before the match goes live stays through the recording", async () => {
    mockGetFeatureFlag.mockResolvedValue(ON);
    const { result, rerender } = renderHook(({ locked }: { locked: boolean }) => useCaptureQuality(true, locked), {
      initialProps: { locked: false },
    });
    await settle();
    rerender({ locked: true });
    expect(result.current).toBe("1080p");
  });
});

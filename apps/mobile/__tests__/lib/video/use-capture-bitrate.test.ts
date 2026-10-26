/**
 * The capture bitrate hook (lib/video/use-capture-bitrate.ts; specs/
 * dynamic-capture-bitrate 7.1, 7.5, D6, D9, D13, AC 6): pending until the
 * inputs land, then the picker's answer following the quality, frozen at the
 * lock; a re-entry decides on its first render and reads nothing.
 */
import { act, renderHook } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const mockGetFeatureFlag = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockLoadHistory = jest.fn();
jest.mock("@/lib/video/capture-bitrate-history", () => ({
  loadThroughputHistory: (...args: unknown[]) => mockLoadHistory(...args),
}));
const mockEnsureCodecs = jest.fn();
const mockCachedCodecs = jest.fn();
jest.mock("@/lib/video/capture-codecs", () => ({
  ensureCaptureCodecs: () => mockEnsureCodecs(),
  cachedCaptureCodecs: () => mockCachedCodecs(),
}));

import {
  CAPTURE_BITRATE_OFF_KEY,
  __resetCaptureBitrateHookForTests,
  lastKnownCaptureBitrateOff,
  primeCaptureBitrateOff,
  readCaptureBitrateOff,
  readCaptureNetwork,
  useCaptureBitrate,
} from "@/lib/video/use-capture-bitrate";
import {
  CAPTURE_FLAG_TIMEOUT_MS,
  CAPTURE_NETWORK_TIMEOUT_MS,
  type CaptureBitrateDecision,
} from "@/lib/video/capture-bitrate";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";

const fetchMock = NetInfo.fetch as jest.Mock;
const WIFI_STATE = { type: "wifi", isConnected: true, isInternetReachable: true, details: null };
const OFF = { ok: true, data: false };

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

type Props = { active: boolean; locked: boolean; quality: MatchVideoCaptureQuality; cameraUp?: boolean };
function renderBitrate(initial: Partial<Props> = {}) {
  return renderHook((p: Props) => useCaptureBitrate({ cameraUp: false, ...p }), {
    initialProps: { active: true, locked: false, quality: "720p", ...initial },
  });
}

beforeEach(async () => {
  __resetCaptureBitrateHookForTests();
  await AsyncStorage.clear();
  mockGetFeatureFlag.mockReset().mockResolvedValue(OFF);
  mockLoadHistory.mockReset().mockResolvedValue([]);
  mockEnsureCodecs.mockReset().mockResolvedValue(["hvc1", "avc1"]);
  mockCachedCodecs.mockReset().mockReturnValue(null);
  fetchMock.mockReset().mockResolvedValue(WIFI_STATE);
});

afterEach(() => jest.useRealTimers());

describe("readCaptureNetwork", () => {
  it("maps type, cellular generation and reachability", async () => {
    fetchMock.mockResolvedValue({ type: "cellular", isInternetReachable: null, details: { cellularGeneration: "4g" } });
    await expect(readCaptureNetwork()).resolves.toEqual({ type: "cellular", cellularGeneration: "4g", isInternetReachable: null });
  });

  it("no details: null generation", async () => {
    await expect(readCaptureNetwork()).resolves.toEqual({ type: "wifi", cellularGeneration: null, isInternetReachable: true });
  });

  it("a throw: null", async () => {
    fetchMock.mockRejectedValue(new Error("native"));
    await expect(readCaptureNetwork()).resolves.toBeNull();
  });

  it("the timeout: null", async () => {
    jest.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const p = readCaptureNetwork();
    await jest.advanceTimersByTimeAsync(CAPTURE_NETWORK_TIMEOUT_MS);
    await expect(p).resolves.toBeNull();
  });
});

describe("readCaptureBitrateOff (the inverted kill switch, D9)", () => {
  it("reads match_capture_bitrate_off; missing or false = feature on", async () => {
    await expect(readCaptureBitrateOff()).resolves.toBe(false);
    expect(mockGetFeatureFlag).toHaveBeenCalledWith({ tag: "client" }, "match_capture_bitrate_off");
  });

  it("true turns it off and is remembered; a failed read keeps the last value", async () => {
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: true, data: true });
    await expect(readCaptureBitrateOff()).resolves.toBe(true);
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await expect(readCaptureBitrateOff()).resolves.toBe(true);
    mockGetFeatureFlag.mockRejectedValueOnce(new Error("boom"));
    await expect(readCaptureBitrateOff()).resolves.toBe(true);
    expect(lastKnownCaptureBitrateOff()).toBe(true);
  });

  it("a failed first read: not disabled", async () => {
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await expect(readCaptureBitrateOff()).resolves.toBe(false);
  });
});

describe("useCaptureBitrate", () => {
  it("pending (today's recording) until the inputs land, then the picker's decision", async () => {
    const { result } = renderBitrate();
    expect(result.current).toEqual(expect.objectContaining({ managed: false, reason: "pending", bitrateBps: null, codec: null }));
    await settle();
    expect(result.current).toEqual(
      expect.objectContaining({ managed: true, codec: "hvc1", level: "normal", bitrateBps: 3_000_000, reason: "no_history_wifi" }),
    );
  });

  it("follows a quality change before the lock", async () => {
    const { result, rerender } = renderBitrate();
    await settle();
    rerender({ active: true, locked: false, quality: "1080p" });
    expect(result.current).toEqual(expect.objectContaining({ quality: "1080p", bitrateBps: 4_500_000 }));
  });

  it("frozen at the lock: referentially stable through later quality changes and an unlock", async () => {
    const { result, rerender } = renderBitrate();
    await settle();
    rerender({ active: true, locked: true, quality: "720p" });
    const frozen = result.current;
    rerender({ active: true, locked: true, quality: "1080p" });
    expect(result.current).toBe(frozen);
    rerender({ active: false, locked: false, quality: "1080p" });
    expect(result.current).toBe(frozen);
    expect(frozen.bitrateBps).toBe(3_000_000);
  });

  it("inputs landing after the lock are dropped: the pending decision stays", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate();
    await settle();
    rerender({ active: true, locked: true, quality: "720p" });
    const frozen = result.current;
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    rerender({ active: true, locked: true, quality: "720p" });
    expect(result.current).toBe(frozen);
    expect(frozen.reason).toBe("pending");
  });

  it("each input fails on its own to a safe value", async () => {
    fetchMock.mockRejectedValue(new Error("netinfo"));
    mockLoadHistory.mockRejectedValue(new Error("storage"));
    mockEnsureCodecs.mockResolvedValue(["hvc1"]);
    mockGetFeatureFlag.mockRejectedValue(new Error("flag"));
    const { result } = renderBitrate();
    await settle();
    expect(result.current).toEqual(expect.objectContaining({ managed: true, level: "weak", reason: "network_unknown", bitrateBps: 2_500_000 }));
  });

  it("the codec query failing: iOS records as today", async () => {
    mockEnsureCodecs.mockRejectedValue(new Error("x"));
    const { result } = renderBitrate();
    await settle();
    expect(result.current).toEqual(expect.objectContaining({ managed: false, reason: "ios_codec_unknown" }));
  });

  it("uses the history it loaded", async () => {
    const now = Date.now();
    mockLoadHistory.mockResolvedValue([
      { ts: now - 1000, network: "wifi", cellularGeneration: null, mbps: 3 },
      { ts: now - 2000, network: "wifi", cellularGeneration: null, mbps: 4 },
    ]);
    const { result } = renderBitrate();
    await settle();
    expect(result.current).toEqual(expect.objectContaining({ level: "weak", reason: "history_weak", historyMedianMbps: 3.5 }));
  });

  it("the kill switch on: unmanaged, disabled", async () => {
    mockGetFeatureFlag.mockResolvedValue({ ok: true, data: true });
    const { result } = renderBitrate();
    await settle();
    expect(result.current).toEqual(expect.objectContaining({ managed: false, reason: "disabled" }));
  });

  it("first active while already locked (re-entry): the weak level on the first render, no reads", async () => {
    mockCachedCodecs.mockReturnValue(["hvc1", "avc1"]);
    const decisions: CaptureBitrateDecision[] = [];
    const { result } = renderHook(() => {
      const d = useCaptureBitrate({ active: true, locked: true, quality: "720p", cameraUp: true });
      decisions.push(d);
      return d;
    });
    expect(decisions[0]).toEqual(
      expect.objectContaining({ managed: true, reason: "reentry", level: "weak", codec: "hvc1", bitrateBps: 2_500_000 }),
    );
    await settle();
    expect(result.current).toBe(decisions[0]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLoadHistory).not.toHaveBeenCalled();
    expect(mockEnsureCodecs).not.toHaveBeenCalled();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
  });

  it("re-entry with no cached codec list on iOS: today's recording", async () => {
    const { result } = renderBitrate({ locked: true });
    expect(result.current).toEqual(expect.objectContaining({ managed: false, reason: "ios_codec_unknown" }));
  });

  it("re-entry honours the last kill switch value read in this process", async () => {
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: true, data: true });
    await readCaptureBitrateOff();
    mockCachedCodecs.mockReturnValue(["hvc1"]);
    const { result } = renderBitrate({ locked: true });
    expect(result.current.reason).toBe("disabled");
  });

  it("re-entry after a relaunch honours the switch read before the relaunch (persisted, primed at app start)", async () => {
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: true, data: true });
    await readCaptureBitrateOff();
    await settle();
    // A new process: module memory is gone, the disk value is not.
    __resetCaptureBitrateHookForTests();
    expect(lastKnownCaptureBitrateOff()).toBe(false);
    await primeCaptureBitrateOff();
    mockCachedCodecs.mockReturnValue(["hvc1"]);
    const { result } = renderBitrate({ locked: true });
    expect(result.current).toEqual(expect.objectContaining({ managed: false, reason: "disabled" }));
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it("re-entry after a relaunch with nothing persisted: feature on (the weak level)", async () => {
    await primeCaptureBitrateOff();
    mockCachedCodecs.mockReturnValue(["hvc1"]);
    const { result } = renderBitrate({ locked: true });
    expect(result.current).toEqual(expect.objectContaining({ managed: true, reason: "reentry", level: "weak" }));
  });

  it("first active a render after the lock (opt-in settling late): still the re-entry path, not a frozen pending", async () => {
    mockCachedCodecs.mockReturnValue(["hvc1"]);
    const { result, rerender } = renderBitrate({ active: false, locked: true });
    expect(result.current.reason).toBe("pending");
    rerender({ active: true, locked: true, quality: "720p" });
    expect(result.current).toEqual(expect.objectContaining({ reason: "reentry", bitrateBps: 2_500_000 }));
    const frozen = result.current;
    await settle();
    rerender({ active: true, locked: true, quality: "1080p" });
    expect(result.current).toBe(frozen);
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
  });

  it("re-entry on Android: the H.264 weak level, synchronously", () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      const { result } = renderBitrate({ locked: true });
      expect(result.current).toEqual(expect.objectContaining({ managed: true, codec: null, ladder: "h264", level: "weak", bitrateBps: 3_000_000, reason: "reentry" }));
    } finally {
      restore.restore();
    }
  });

  it("inactive never reads", async () => {
    const { result, rerender } = renderBitrate({ active: false });
    await settle();
    rerender({ active: false, locked: false, quality: "720p" });
    await settle();
    expect(result.current.reason).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    expect(mockLoadHistory).not.toHaveBeenCalled();
    expect(mockEnsureCodecs).not.toHaveBeenCalled();
  });

  it("reads once per viewfinder, when it first becomes active", async () => {
    const { rerender } = renderBitrate({ active: false });
    rerender({ active: true, locked: false, quality: "720p" });
    await settle();
    rerender({ active: false, locked: false, quality: "720p" });
    rerender({ active: true, locked: false, quality: "720p" });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it("an unmount before the inputs land is quiet", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { unmount } = renderBitrate();
    unmount();
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  });
});

describe("the kill switch read and its persistence (D9)", () => {
  it("a read slower than the timeout keeps the last value and never holds the inputs back", async () => {
    jest.useFakeTimers();
    mockGetFeatureFlag.mockReturnValue(new Promise(() => undefined));
    const p = readCaptureBitrateOff();
    await jest.advanceTimersByTimeAsync(CAPTURE_FLAG_TIMEOUT_MS);
    await expect(p).resolves.toBe(false);
  });

  it("an answer is persisted; prime loads it", async () => {
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: true, data: true });
    await readCaptureBitrateOff();
    await settle();
    expect(JSON.parse((await AsyncStorage.getItem(CAPTURE_BITRATE_OFF_KEY))!)).toEqual({ off: true });
    __resetCaptureBitrateHookForTests();
    await primeCaptureBitrateOff();
    expect(lastKnownCaptureBitrateOff()).toBe(true);
  });

  it("prime never overrides a fresher answer read in this process", async () => {
    await AsyncStorage.setItem(CAPTURE_BITRATE_OFF_KEY, JSON.stringify({ off: true }));
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: true, data: false });
    await readCaptureBitrateOff();
    await primeCaptureBitrateOff();
    expect(lastKnownCaptureBitrateOff()).toBe(false);
  });

  it("a corrupt or unreadable stored value: feature on, no throw", async () => {
    await AsyncStorage.setItem(CAPTURE_BITRATE_OFF_KEY, "{{");
    await expect(primeCaptureBitrateOff()).resolves.toBeUndefined();
    expect(lastKnownCaptureBitrateOff()).toBe(false);
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(primeCaptureBitrateOff()).resolves.toBeUndefined();
    expect(lastKnownCaptureBitrateOff()).toBe(false);
  });

  it("a failed read after a relaunch falls back to the persisted value", async () => {
    await AsyncStorage.setItem(CAPTURE_BITRATE_OFF_KEY, JSON.stringify({ off: true }));
    await primeCaptureBitrateOff();
    mockGetFeatureFlag.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    await expect(readCaptureBitrateOff()).resolves.toBe(true);
  });
});

// Review finding M1: on Android a new videoBitrate prop recreates the CameraX
// camera asynchronously, and a recordAsync racing that teardown loses the
// clip. So once the camera is up, Android never changes the bitrate on its own.
describe("Android: held from the camera's mount", () => {
  let restore: { restore: () => void };
  beforeEach(() => {
    restore = jest.replaceProperty(Platform, "OS", "android");
  });
  afterEach(() => restore.restore());

  it("inputs landing after the camera is up are not applied: pending (today's recording) for this face-off", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate();
    rerender({ active: true, locked: false, quality: "720p", cameraUp: true });
    const atMount = result.current;
    expect(atMount.reason).toBe("pending");
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toBe(atMount);
    rerender({ active: true, locked: true, quality: "720p", cameraUp: true });
    expect(result.current).toBe(atMount);
    expect(result.current.bitrateBps).toBeNull();
  });

  it("inputs landed before the camera mounts: the camera mounts with them and they hold through the lock", async () => {
    const { result, rerender } = renderBitrate();
    await settle();
    rerender({ active: true, locked: false, quality: "720p", cameraUp: true });
    const atMount = result.current;
    expect(atMount).toEqual(expect.objectContaining({ managed: true, codec: null, bitrateBps: 4_000_000 }));
    rerender({ active: true, locked: true, quality: "720p", cameraUp: true });
    expect(result.current).toBe(atMount);
  });

  it("inputs landing in the same render as the camera mount are what it mounts with", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate();
    await settle();
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      rerender({ active: true, locked: false, quality: "720p", cameraUp: true });
    });
    expect(result.current.bitrateBps).toBe(4_000_000);
  });

  it("inputs landing in the same render as the lock, camera already up: no prop change", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate({ cameraUp: true });
    const atMount = result.current;
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      rerender({ active: true, locked: true, quality: "720p", cameraUp: true });
    });
    expect(result.current).toBe(atMount);
    expect(result.current.bitrateBps).toBeNull();
  });

  it("a quality change while held (it recreates the camera anyway) takes the matching ladder, never below its floor", async () => {
    const { result, rerender } = renderBitrate();
    await settle();
    rerender({ active: true, locked: false, quality: "720p", cameraUp: true });
    expect(result.current.bitrateBps).toBe(4_000_000);
    rerender({ active: true, locked: false, quality: "1080p", cameraUp: true });
    expect(result.current).toEqual(expect.objectContaining({ quality: "1080p", bitrateBps: 6_000_000 }));
    // Held again: a later render without a quality change keeps it.
    const held = result.current;
    rerender({ active: true, locked: true, quality: "1080p", cameraUp: true });
    expect(result.current).toBe(held);
  });

  it("a camera that unmounts before the lock stays held (no change on remount)", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate({ cameraUp: true });
    const held = result.current;
    rerender({ active: true, locked: false, quality: "720p", cameraUp: false });
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    rerender({ active: true, locked: false, quality: "720p", cameraUp: true });
    expect(result.current).toBe(held);
  });
});

describe("iOS: a late decision still applies up to the lock (the prop is read at recordAsync)", () => {
  it("inputs landing after the camera is up are applied", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result } = renderBitrate({ cameraUp: true });
    expect(result.current.reason).toBe("pending");
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toEqual(expect.objectContaining({ managed: true, codec: "hvc1", bitrateBps: 3_000_000 }));
  });

  it("inputs landing in the same render as the lock are frozen as decided", async () => {
    let land: (v: unknown) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((res) => (land = res)));
    const { result, rerender } = renderBitrate({ cameraUp: true });
    await act(async () => {
      land(WIFI_STATE);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      rerender({ active: true, locked: true, quality: "720p", cameraUp: true });
    });
    const frozen = result.current;
    expect(frozen.bitrateBps).toBe(3_000_000);
    rerender({ active: true, locked: true, quality: "1080p", cameraUp: true });
    expect(result.current).toBe(frozen);
  });
});

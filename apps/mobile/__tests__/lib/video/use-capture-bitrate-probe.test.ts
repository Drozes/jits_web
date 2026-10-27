/**
 * The capture bitrate hook with the phase 2 capture prep (lib/video/
 * use-capture-bitrate.ts, capture-prep.ts; specs/dynamic-capture-bitrate
 * 16.7, AC M8): the base decision first, the probe when it lands before the
 * lock (iOS) or the hold (Android), a prep that landed before the first
 * render used on that render, the probe stopped at the lock and released on
 * unmount, nothing for a re-entry, an inactive viewer or practice.
 */
import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockReadInputs = jest.fn();
jest.mock("@/lib/video/capture-inputs", () => ({
  readCaptureInputs: () => mockReadInputs(),
  lastKnownCaptureBitrateOff: () => false,
  __resetCaptureInputsForTests: () => undefined,
  CAPTURE_BITRATE_OFF_KEY: "elo-capture-bitrate-off::v1",
  primeCaptureBitrateOff: async () => undefined,
  readCaptureBitrateOff: async () => false,
  readCaptureNetwork: async () => null,
  readCaptureProbeOff: async () => false,
}));
jest.mock("@/lib/video/capture-codecs", () => ({
  ensureCaptureCodecs: async () => ["hvc1", "avc1"],
  cachedCaptureCodecs: () => ["hvc1", "avc1"],
}));

type Probe = { aborted: () => boolean; resolve: (mbps: number | null) => void };
const mockProbes: Probe[] = [];
jest.mock("@/lib/video/net-probe", () => ({
  isNetProbeAbsent: () => false,
  runNetProbe: (opts: { network: string; signal: { aborted: boolean; addEventListener: (t: "abort", cb: () => void) => void } }) =>
    new Promise((resolve) => {
      const done = (status: string, mbps: number | null) =>
        resolve({
          status,
          mbps,
          method: mbps != null ? "steady" : null,
          bytesSent: 0,
          elapsedMs: 0,
          httpStatus: null,
          serverBytes: null,
          serverMs: null,
          network: opts.network,
          endedAt: Date.now(),
        });
      mockProbes.push({ aborted: () => opts.signal.aborted, resolve: (mbps) => done(mbps != null ? "ok" : "failed", mbps) });
      opts.signal.addEventListener("abort", () => done("cancelled", null));
    }),
}));
jest.mock("@/lib/video/video-upload-manager", () => ({
  hasActiveVideoUploads: () => false,
  subscribeUploadActivity: () => () => undefined,
}));
const mockRecordSample = jest.fn(async () => undefined);
jest.mock("@/lib/video/capture-bitrate-history", () => ({
  throughputHistoryGeneration: () => 0,
  recordThroughputSample: (...a: unknown[]) => mockRecordSample(...(a as [])),
}));
jest.mock("@/lib/error-tracking/sentry", () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn() }));

import { CAPTURE_PREP_INACTIVE_STOP_MS, useCaptureBitrate } from "@/lib/video/use-capture-bitrate";
import { __resetCapturePrepForTests, getCapturePrepSnapshot, startCapturePrep } from "@/lib/video/capture-prep";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";

const HERE = { lat: 43.65, lng: -79.38 };
const WIFI_INPUTS = {
  disabled: false,
  probeOff: false,
  codecs: ["hvc1", "avc1"],
  network: { type: "wifi", cellularGeneration: null, isInternetReachable: true },
  history: [],
  location: HERE,
  now: Date.now(),
};

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

type Props = { active: boolean; locked: boolean; quality: MatchVideoCaptureQuality; cameraUp: boolean; prepKey: string | null };
function render(initial: Partial<Props> = {}) {
  return renderHook((p: Props) => useCaptureBitrate(p), {
    initialProps: { active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M1", ...initial },
  });
}

let restoreOs: { restore: () => void } | null = null;
function onAndroid() {
  restoreOs = jest.replaceProperty(Platform, "OS", "android");
}

beforeEach(() => {
  __resetCapturePrepForTests();
  mockProbes.length = 0;
  mockRecordSample.mockClear();
  mockReadInputs.mockReset().mockResolvedValue({ ...WIFI_INPUTS, now: Date.now() });
});
afterEach(() => {
  restoreOs?.restore();
  restoreOs = null;
});

describe("iOS", () => {
  it("the base decision as soon as the inputs land, then the probe's when it lands before the lock", async () => {
    const { result, rerender } = render();
    expect(result.current).toEqual(expect.objectContaining({ reason: "pending", probeOutcome: "pending" }));
    await settle();
    expect(result.current).toEqual(
      expect.objectContaining({ reason: "no_history_wifi", level: "normal", probeOutcome: "pending", locationKnown: true }),
    );
    expect(mockProbes).toHaveLength(1);
    await act(async () => {
      mockProbes[0].resolve(3);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toEqual(
      expect.objectContaining({ reason: "probe_weak", level: "weak", bitrateBps: 2_500_000, probeMbps: 3, probeOutcome: "applied" }),
    );
    rerender({ active: true, locked: true, quality: "720p", cameraUp: true, prepKey: "M1" });
    expect(result.current.reason).toBe("probe_weak");
  });

  it("the lock stops the probe; the frozen decision reports pending, and a later result changes nothing", async () => {
    const { result, rerender } = render({ cameraUp: true });
    await settle();
    rerender({ active: true, locked: true, quality: "720p", cameraUp: true, prepKey: "M1" });
    const frozen = result.current;
    expect(frozen).toEqual(expect.objectContaining({ reason: "no_history_wifi", probeOutcome: "pending" }));
    expect(mockProbes[0].aborted()).toBe(true);
    await settle();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("cancelled");
    expect(result.current).toBe(frozen);
    expect(mockRecordSample).not.toHaveBeenCalled();
  });

  it("a failed probe leaves the base decision with outcome failed", async () => {
    const { result } = render();
    await settle();
    await act(async () => {
      mockProbes[0].resolve(null);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toEqual(expect.objectContaining({ reason: "no_history_wifi", probeOutcome: "failed", probeMbps: null }));
  });
});

describe("Android", () => {
  beforeEach(onAndroid);

  it("a probe landing after the camera mounted does not change the held decision, whose outcome is pending", async () => {
    const { result, rerender } = render();
    await settle();
    rerender({ active: true, locked: false, quality: "720p", cameraUp: true, prepKey: "M1" });
    const held = result.current;
    expect(held).toEqual(expect.objectContaining({ reason: "no_history_wifi", bitrateBps: 4_000_000, probeOutcome: "pending" }));
    await act(async () => {
      mockProbes[0].resolve(2);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toBe(held);
    // Still stored for next time (E12).
    expect(mockRecordSample).toHaveBeenCalledWith(expect.objectContaining({ mbps: 2, source: "probe", cell: HERE }), 0);
  });

  it("a prep that landed before the first render (the timekeeper's) is used on that render: the decided level, not pending", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await settle();
    await act(async () => {
      mockProbes[0].resolve(20);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    const { result } = render({ cameraUp: true });
    expect(result.current).toEqual(
      expect.objectContaining({ reason: "probe_normal", bitrateBps: 4_000_000, probeOutcome: "applied", managed: true }),
    );
    // Claimed, not re-read and not re-probed.
    await settle();
    expect(mockReadInputs).toHaveBeenCalledTimes(1);
    expect(mockProbes).toHaveLength(1);
  });

  it("base inputs landed before the first render, probe still running: the held value is the base level", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await settle();
    const { result } = render({ cameraUp: true });
    expect(result.current).toEqual(expect.objectContaining({ reason: "no_history_wifi", managed: true, probeOutcome: "pending" }));
  });
});

describe("lifecycle", () => {
  it("unmount releases the prep and aborts a running probe", async () => {
    const { unmount } = render();
    await settle();
    expect(getCapturePrepSnapshot("M1")).not.toBeNull();
    unmount();
    expect(getCapturePrepSnapshot("M1")).toBeNull();
    expect(mockProbes[0].aborted()).toBe(true);
  });

  it("a re-entry starts no prep and no probe; its outcome is reentry", async () => {
    const { result } = render({ locked: true });
    await settle();
    expect(result.current).toEqual(expect.objectContaining({ reason: "reentry", probeOutcome: "reentry" }));
    expect(mockReadInputs).not.toHaveBeenCalled();
    expect(mockProbes).toHaveLength(0);
    expect(getCapturePrepSnapshot("M1")).toBeNull();
  });

  it("a re-entry ignores a prep the sheet left behind", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await settle();
    const { result } = render({ locked: true });
    expect(result.current.reason).toBe("reentry");
  });

  it("inactive never starts a prep", async () => {
    render({ active: false });
    await settle();
    expect(mockReadInputs).not.toHaveBeenCalled();
    expect(getCapturePrepSnapshot("M1")).toBeNull();
  });

  it("practice (prepKey null) never probes; outcome practice", async () => {
    const { result } = render({ prepKey: null });
    await settle();
    expect(mockReadInputs).toHaveBeenCalledTimes(1);
    expect(mockProbes).toHaveLength(0);
    expect(result.current).toEqual(expect.objectContaining({ reason: "no_history_wifi", probeOutcome: "practice" }));
  });

  it("two practice viewfinders never share a prep", async () => {
    render({ prepKey: null });
    render({ prepKey: null });
    await settle();
    expect(mockReadInputs).toHaveBeenCalledTimes(2);
  });

  it("toggling active reads nothing again (one read per viewfinder)", async () => {
    const { rerender } = render();
    await settle();
    rerender({ active: false, locked: false, quality: "720p", cameraUp: false, prepKey: "M1" });
    rerender({ active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M1" });
    await settle();
    expect(mockReadInputs).toHaveBeenCalledTimes(1);
    expect(mockProbes).toHaveLength(1);
  });
});

// Phase 2 review MINOR 6: a handed-off timekeeper prep whose viewfinder
// never records must not keep spending the probe.
describe("a handed-off prep and an inactive viewfinder", () => {
  afterEach(() => jest.useRealTimers());

  it("the probe is stopped once the viewfinder stays inactive past the grace period; the inputs stay", async () => {
    jest.useFakeTimers();
    startCapturePrep("M1", { matchId: "M1" });
    await settle();
    expect(mockProbes).toHaveLength(1);
    render({ active: false });
    act(() => jest.advanceTimersByTime(CAPTURE_PREP_INACTIVE_STOP_MS - 1));
    expect(mockProbes[0].aborted()).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(mockProbes[0].aborted()).toBe(true);
    await settle();
    expect(getCapturePrepSnapshot("M1")).toEqual(expect.objectContaining({ probeOutcome: "cancelled" }));
    expect(getCapturePrepSnapshot("M1")?.inputs).not.toBeNull();
  });

  it("a timekeeper whose opt-in settles a little late keeps the probe", async () => {
    jest.useFakeTimers();
    startCapturePrep("M1", { matchId: "M1" });
    await settle();
    const { rerender } = render({ active: false });
    act(() => jest.advanceTimersByTime(CAPTURE_PREP_INACTIVE_STOP_MS / 2));
    rerender({ active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M1" });
    act(() => jest.advanceTimersByTime(CAPTURE_PREP_INACTIVE_STOP_MS * 2));
    expect(mockProbes[0].aborted()).toBe(false);
  });

  it("an athlete's own prep is never affected: inactive first, active a render later", async () => {
    jest.useFakeTimers();
    const { rerender } = render({ active: false });
    rerender({ active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M1" });
    await settle();
    expect(mockProbes).toHaveLength(1);
    act(() => jest.advanceTimersByTime(CAPTURE_PREP_INACTIVE_STOP_MS * 2));
    expect(mockProbes[0].aborted()).toBe(false);
  });
});

// Phase 2 review MINOR 3: the probe's age is measured when it is used, so a
// probe landing more than a minute after the inputs is applied, not dropped.
describe("probe age", () => {
  it("a probe landing long after the inputs (but within 10 min) is applied", async () => {
    mockReadInputs.mockResolvedValue({ ...WIFI_INPUTS, now: Date.now() - 5 * 60_000 });
    const { result } = render();
    await settle();
    await act(async () => {
      mockProbes[0].resolve(20);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current).toEqual(expect.objectContaining({ reason: "probe_normal", probeOutcome: "applied" }));
  });

  it("a probe older than 10 minutes when the decision is made is stale", async () => {
    const realNow = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(realNow);
    const { result, rerender } = render();
    await settle();
    await act(async () => {
      mockProbes[0].resolve(20);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current.reason).toBe("probe_normal");
    // Eleven minutes later a quality change recomputes the decision.
    spy.mockReturnValue(realNow + 11 * 60_000);
    rerender({ active: true, locked: false, quality: "1080p", cameraUp: false, prepKey: "M1" });
    expect(result.current).toEqual(expect.objectContaining({ reason: "no_history_wifi", probeOutcome: "stale" }));
    spy.mockRestore();
  });
});

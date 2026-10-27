/**
 * The per-match capture prep (lib/video/capture-prep.ts; specs/
 * dynamic-capture-bitrate 16.3 E6, E11, E12, 16.5, AC M6): one set of reads
 * and at most one probe per match per process, skipped or aborted for the
 * right reasons, results stored as history samples, entries expiring.
 */
import { AppState, Platform } from "react-native";

const mockReadInputs = jest.fn();
jest.mock("@/lib/video/capture-inputs", () => ({
  readCaptureInputs: () => mockReadInputs(),
}));

type Probe = { opts: { network: string; signal: { aborted: boolean; addEventListener: (t: "abort", cb: () => void) => void } }; resolve: (r: unknown) => void };
const mockProbes: Probe[] = [];
const mockAbsent = { current: false };
jest.mock("@/lib/video/net-probe", () => ({
  isNetProbeAbsent: () => mockAbsent.current,
  runNetProbe: (opts: Probe["opts"]) =>
    new Promise((resolve) => {
      const probe: Probe = { opts, resolve };
      mockProbes.push(probe);
      // Like the real module: an abort settles it as cancelled.
      opts.signal.addEventListener("abort", () => resolve(mockResult("cancelled", null, opts.network)));
    }),
}));

const mockUploads = { active: false, listeners: new Set<() => void>() };
jest.mock("@/lib/video/video-upload-manager", () => ({
  hasActiveVideoUploads: () => mockUploads.active,
  subscribeUploadActivity: (cb: () => void) => {
    mockUploads.listeners.add(cb);
    return () => mockUploads.listeners.delete(cb);
  },
}));

const mockRecordSample = jest.fn(async () => undefined);
jest.mock("@/lib/video/capture-bitrate-history", () => ({
  throughputHistoryGeneration: () => 0,
  recordThroughputSample: (...a: unknown[]) => mockRecordSample(...(a as [])),
}));

const mockAddBreadcrumb = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  addBreadcrumb: (...a: unknown[]) => mockAddBreadcrumb(...a),
  captureException: jest.fn(),
}));

import {
  CAPTURE_PREP_MAX_AGE_MS,
  __resetCapturePrepForTests,
  getCapturePrepSnapshot,
  releaseAllCapturePreps,
  releaseCapturePrep,
  startCapturePrep,
  stopCapturePrepProbe,
  subscribeCapturePrep,
} from "@/lib/video/capture-prep";
import type { CaptureInputs } from "@/lib/video/capture-inputs";

function mockResult(status: string, mbps: number | null, network = "wifi") {
  return {
    status,
    mbps,
    method: mbps != null ? "steady" : null,
    bytesSent: 4_194_304,
    elapsedMs: 3_000,
    httpStatus: status === "ok" ? 200 : null,
    serverBytes: null,
    serverMs: null,
    network,
    endedAt: 1_800_000_003_000,
  };
}

const HERE = { lat: 43.65, lng: -79.38 };
const NOW = 1_800_000_000_000;
function inputs(over: Partial<CaptureInputs> = {}): CaptureInputs {
  return {
    disabled: false,
    probeOff: false,
    codecs: ["hvc1", "avc1"],
    network: { type: "wifi", cellularGeneration: null, isInternetReachable: true },
    history: [],
    location: HERE,
    now: NOW,
    ...over,
  };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

let restoreOs: { restore: () => void };
beforeEach(() => {
  restoreOs = jest.replaceProperty(Platform, "OS", "ios");
  __resetCapturePrepForTests();
  mockProbes.length = 0;
  mockAbsent.current = false;
  mockUploads.active = false;
  mockUploads.listeners.clear();
  mockReadInputs.mockReset().mockResolvedValue(inputs());
  mockRecordSample.mockClear();
  mockAddBreadcrumb.mockClear();
});
afterEach(() => {
  __resetCapturePrepForTests();
  restoreOs.restore();
  jest.useRealTimers();
});

describe("start", () => {
  it("is idempotent per key: two starts, one set of reads, one probe", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    startCapturePrep("M1", { matchId: "M1" });
    expect(getCapturePrepSnapshot("M1")).toEqual({ inputs: null, probe: null, probeOutcome: "pending" });
    await flush();
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(mockReadInputs).toHaveBeenCalledTimes(1);
    expect(mockProbes).toHaveLength(1);
    expect(getCapturePrepSnapshot("M1")).toEqual(expect.objectContaining({ inputs: inputs(), probeOutcome: "pending" }));
  });

  it("notifies subscribers when the inputs land and when the probe lands; the snapshot is stable between changes", async () => {
    const cb = jest.fn();
    const unsub = subscribeCapturePrep("M1", cb);
    startCapturePrep("M1", { matchId: "M1" });
    const first = getCapturePrepSnapshot("M1");
    expect(getCapturePrepSnapshot("M1")).toBe(first);
    await flush();
    expect(cb).toHaveBeenCalled();
    const calls = cb.mock.calls.length;
    mockProbes[0].resolve(mockResult("ok", 12.5));
    await flush();
    expect(cb.mock.calls.length).toBeGreaterThan(calls);
    expect(getCapturePrepSnapshot("M1")).toEqual(
      expect.objectContaining({ probe: { mbps: 12.5, network: "wifi", at: 1_800_000_003_000 }, probeOutcome: "pending" }),
    );
    unsub();
  });

  it("probes with the class at the start", async () => {
    mockReadInputs.mockResolvedValue(inputs({ network: { type: "cellular", cellularGeneration: "5g", isInternetReachable: true } }));
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(mockProbes[0].opts.network).toBe("cellular");
  });
});

describe("one probe per match id per process", () => {
  it("release then start again: no second probe, not_needed", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    releaseCapturePrep("M1");
    await flush();
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(mockProbes).toHaveLength(1);
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("not_needed");
  });
});

describe("skipped with the right outcome", () => {
  it.each<[string, Partial<CaptureInputs>]>([
    ["the bitrate kill switch", { disabled: true }],
    ["the probe kill switch", { probeOff: true }],
  ])("off: %s", async (_name, over) => {
    mockReadInputs.mockResolvedValue(inputs(over));
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("off");
    expect(mockProbes).toHaveLength(0);
  });

  it("practice (no match id)", async () => {
    startCapturePrep("practice:1", { matchId: null });
    await flush();
    expect(getCapturePrepSnapshot("practice:1")?.probeOutcome).toBe("practice");
    expect(mockProbes).toHaveLength(0);
  });

  it("not_needed: wifi with 2 samples here", async () => {
    const s = { ts: NOW - 1000, network: "wifi" as const, cellularGeneration: null, mbps: 30, cell: HERE, source: "upload" as const };
    mockReadInputs.mockResolvedValue(inputs({ history: [s, s] }));
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("not_needed");
    expect(mockProbes).toHaveLength(0);
  });

  it("not_needed: offline (a probe cannot change it)", async () => {
    mockReadInputs.mockResolvedValue(inputs({ network: { type: "none", cellularGeneration: null, isInternetReachable: false } }));
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("not_needed");
  });

  it("absent: net-probe answered 404 earlier in this process", async () => {
    mockAbsent.current = true;
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("absent");
    expect(mockProbes).toHaveLength(0);
  });

  it("busy: a match video upload is running at the start", async () => {
    mockUploads.active = true;
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("busy");
    expect(mockProbes).toHaveLength(0);
  });

  it("stopped before the inputs land: no probe ever starts (cancelled)", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    stopCapturePrepProbe("M1");
    await flush();
    expect(mockProbes).toHaveLength(0);
    expect(getCapturePrepSnapshot("M1")).toEqual(expect.objectContaining({ inputs: inputs(), probeOutcome: "cancelled" }));
  });

  it("released before the inputs land: nothing starts and the entry stays gone", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    releaseCapturePrep("M1");
    await flush();
    expect(mockProbes).toHaveLength(0);
    expect(getCapturePrepSnapshot("M1")).toBeNull();
  });
});

describe("aborts", () => {
  it("an upload starting mid-probe aborts it (cancelled) and stores nothing", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(mockUploads.listeners.size).toBe(1);
    mockUploads.active = true;
    for (const l of [...mockUploads.listeners]) l();
    await flush();
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("cancelled");
    expect(mockRecordSample).not.toHaveBeenCalled();
    expect(mockUploads.listeners.size).toBe(0);
  });

  it("upload activity that is not an active upload does not abort", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    for (const l of [...mockUploads.listeners]) l();
    expect(mockProbes[0].opts.signal.aborted).toBe(false);
  });

  it("starting a probe for key B aborts key A's probe", async () => {
    startCapturePrep("A", { matchId: "A" });
    await flush();
    startCapturePrep("B", { matchId: "B" });
    await flush();
    expect(mockProbes).toHaveLength(2);
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
    expect(mockProbes[1].opts.signal.aborted).toBe(false);
    expect(getCapturePrepSnapshot("A")?.probeOutcome).toBe("cancelled");
  });

  it("stopCapturePrepProbe aborts but keeps the snapshot", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    stopCapturePrepProbe("M1");
    await flush();
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
    expect(getCapturePrepSnapshot("M1")).toEqual(expect.objectContaining({ inputs: inputs(), probeOutcome: "cancelled" }));
  });

  it("releaseCapturePrep aborts and drops the entry; release all drops every entry", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    startCapturePrep("practice:9", { matchId: null });
    await flush();
    releaseCapturePrep("M1");
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
    expect(getCapturePrepSnapshot("M1")).toBeNull();
    releaseAllCapturePreps();
    expect(getCapturePrepSnapshot("practice:9")).toBeNull();
  });
});

// Phase 2 review MAJOR 1: a probe measured across a background would read
// as a slow link and be stored for 14 days.
describe("backgrounding", () => {
  let appListeners: ((s: string) => void)[];
  let removed: number;
  beforeEach(() => {
    appListeners = [];
    removed = 0;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, cb: (s: string) => void) => {
      appListeners.push(cb);
      return { remove: () => void (removed += 1) };
    }) as never);
  });
  afterEach(() => (AppState.addEventListener as jest.Mock).mockRestore());

  it("going to the background mid-probe aborts it: cancelled, nothing stored, listener removed", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(appListeners).toHaveLength(1);
    appListeners[0]("background");
    await flush();
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("cancelled");
    expect(mockRecordSample).not.toHaveBeenCalled();
    expect(removed).toBe(1);
  });

  it("already in the background when the inputs land: never sent, cancelled", async () => {
    const prev = AppState.currentState;
    (AppState as { currentState: unknown }).currentState = "background";
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    (AppState as { currentState: unknown }).currentState = prev;
    expect(mockProbes).toHaveLength(0);
    expect(appListeners).toHaveLength(0);
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe("cancelled");
  });

  it("inactive at the start still probes", async () => {
    const prev = AppState.currentState;
    (AppState as { currentState: unknown }).currentState = "inactive";
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    (AppState as { currentState: unknown }).currentState = prev;
    expect(mockProbes).toHaveLength(1);
  });

  it("inactive (notification shade) does not abort; the listener goes when the probe settles", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    appListeners[0]("inactive");
    expect(mockProbes[0].opts.signal.aborted).toBe(false);
    mockProbes[0].resolve(mockResult("ok", 10));
    await flush();
    expect(removed).toBe(1);
  });
});

describe("results", () => {
  it("a successful probe appends exactly one source: probe sample with the inputs' cell and the class at the start", async () => {
    mockReadInputs.mockResolvedValue(inputs({ network: { type: "cellular", cellularGeneration: "5g", isInternetReachable: true } }));
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    mockProbes[0].resolve(mockResult("ok", 6.2, "cellular"));
    await flush();
    expect(mockRecordSample).toHaveBeenCalledTimes(1);
    expect(mockRecordSample).toHaveBeenCalledWith({
      ts: 1_800_000_003_000,
      network: "cellular",
      cellularGeneration: "5g",
      mbps: 6.2,
      cell: HERE,
      source: "probe",
    }, 0);
  });

  it("a probe that lands after the prep was released (a late Android hold) is still stored", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    const probe = mockProbes[0];
    // Resolve before the release's abort can (as a probe that landed at the same time).
    probe.resolve(mockResult("ok", 20));
    releaseCapturePrep("M1");
    await flush();
    expect(mockRecordSample).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "absent"])("a %s probe appends nothing and sets the outcome", async (status) => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    mockProbes[0].resolve(mockResult(status, null));
    await flush();
    expect(mockRecordSample).not.toHaveBeenCalled();
    expect(getCapturePrepSnapshot("M1")?.probeOutcome).toBe(status);
  });

  it("one breadcrumb per finished probe, with no cell, match id or coordinate", async () => {
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    mockProbes[0].resolve(mockResult("ok", 12.345));
    await flush();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: "video.capture",
      message: "net probe",
      level: "info",
      data: {
        status: "ok",
        mbps: 12.3,
        method: "steady",
        bytesSent: 4_194_304,
        elapsedMs: 3_000,
        httpStatus: 200,
        serverMs: null,
        network: "wifi",
      },
    });
    const text = JSON.stringify(mockAddBreadcrumb.mock.calls);
    expect(text).not.toMatch(/M1|43\.65|79\.38|"lat"|"lng"|"cell"/);
  });
});

describe("expiry", () => {
  it("an unclaimed entry is released after 5 minutes (its probe aborted)", async () => {
    jest.useFakeTimers();
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    expect(mockProbes).toHaveLength(1);
    jest.advanceTimersByTime(CAPTURE_PREP_MAX_AGE_MS - 1);
    expect(getCapturePrepSnapshot("M1")).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(getCapturePrepSnapshot("M1")).toBeNull();
    expect(mockProbes[0].opts.signal.aborted).toBe(true);
  });

  it("an entry a hook holds (subscribed) is kept past 5 minutes; the hook releases it", async () => {
    jest.useFakeTimers();
    const unsub = subscribeCapturePrep("M1", () => undefined);
    startCapturePrep("M1", { matchId: "M1" });
    await flush();
    jest.advanceTimersByTime(CAPTURE_PREP_MAX_AGE_MS + 1);
    expect(getCapturePrepSnapshot("M1")).not.toBeNull();
    unsub();
    releaseCapturePrep("M1");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("a release clears the expiry timer", () => {
    jest.useFakeTimers();
    startCapturePrep("M1", { matchId: "M1" });
    releaseCapturePrep("M1");
    expect(jest.getTimerCount()).toBe(0);
  });
});

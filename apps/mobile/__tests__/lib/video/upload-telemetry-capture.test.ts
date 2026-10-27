/**
 * The capture bitrate side of upload telemetry (lib/video/upload-telemetry.ts;
 * specs/dynamic-capture-bitrate 7.4, 8 #10, section 10, AC 9): the record
 * start breadcrumb, the uploaded event's capture fields and tag, and the
 * throughput sample it appends, which can never cost the event.
 */
import NetInfo from "@react-native-community/netinfo";

const mockCaptureMessage = jest.fn();
const mockAddBreadcrumb = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  addBreadcrumb: (...a: unknown[]) => mockAddBreadcrumb(...a),
}));

const mockRecordSample = jest.fn();
jest.mock("@/lib/video/capture-bitrate-history", () => ({
  ...jest.requireActual("@/lib/video/capture-bitrate-history"),
  recordThroughputSample: (...a: unknown[]) => mockRecordSample(...a),
}));

import {
  __resetUploadTelemetry,
  trackAttemptFailed,
  trackCaptureBitrate,
  trackRunStart,
  trackUploaded,
} from "@/lib/video/upload-telemetry";
import { pickCaptureBitrate, unmanagedDecision } from "@/lib/video/capture-bitrate";
import { toPersistedCaptureBitrate } from "@/lib/video/upload-persistence";

const MiB = 1024 * 1024;
const T0 = 1_800_000_000_000;
const fetchMock = NetInfo.fetch as jest.Mock;
let now = T0;

beforeEach(() => {
  __resetUploadTelemetry();
  mockCaptureMessage.mockReset();
  mockAddBreadcrumb.mockReset();
  mockRecordSample.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockResolvedValue({ type: "cellular", isInternetReachable: true, details: { cellularGeneration: "5g" } });
  now = T0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => (Date.now as jest.Mock).mockRestore());

/** A fresh run that sends `bytes` in `ms`. */
async function landRun(bytes: number, ms: number, captureBitrate?: Parameters<typeof trackUploaded>[0]["captureBitrate"]) {
  trackRunStart({ matchId: "M1", phase: "bytes", bytesUploaded: 0, fileSizeBytes: bytes, resumed: false, trigger: "start" });
  now += ms;
  await trackUploaded({ matchId: "M1", fileSizeBytes: bytes, createdAt: T0, captureBitrate });
}

const event = () => mockCaptureMessage.mock.calls.find((c) => c[0] === "Match video uploaded")?.[1];

describe("trackUploaded", () => {
  it("adds the capture fields and the level tag", async () => {
    await landRun(100 * MiB, 60_000, {
      bitrateBps: 2_500_000,
      codec: "hvc1",
      level: "weak",
      ladder: "hevc",
      reason: "no_history_cellular",
      network: "cellular",
      historyMedianMbps: null,
    });
    expect(event().tags).toEqual(expect.objectContaining({ "video.capture.level": "weak", "video.upload.network": "cellular" }));
    expect(event().extra).toEqual(
      expect.objectContaining({
        captureBitrateBps: 2_500_000,
        captureCodec: "hvc1",
        captureLevel: "weak",
        captureLadder: "hevc",
        captureReason: "no_history_cellular",
        captureNetwork: "cellular",
        captureHistoryMedianMbps: null,
        // The existing fields are unchanged.
        bytes: 100 * MiB,
        durationMs: 60_000,
        networkType: "cellular",
      }),
    );
  });

  it("an unmanaged decision tags unmanaged; no decision tags unknown", async () => {
    const { bitrateBps, codec, level, ladder, reason, network, historyMedianMbps } = unmanagedDecision("720p", "disabled");
    await landRun(100 * MiB, 60_000, { bitrateBps, codec, level, ladder, reason, network, historyMedianMbps });
    expect(event().tags["video.capture.level"]).toBe("unmanaged");
    mockCaptureMessage.mockReset();
    await landRun(100 * MiB, 60_000);
    expect(event().tags["video.capture.level"]).toBe("unknown");
    expect(event().extra.captureReason).toBeNull();
  });

  it("appends a valid throughput sample, with the cellular generation", async () => {
    await landRun(100 * MiB, 80_000);
    expect(mockRecordSample).toHaveBeenCalledTimes(1);
    expect(mockRecordSample).toHaveBeenCalledWith(
      {
        ts: T0 + 80_000,
        network: "cellular",
        cellularGeneration: "5g",
        mbps: (100 * MiB * 8) / 80 / 1e6,
        cell: null,
        source: "upload",
      },
      // The history generation the run started in (sign-out race, NIT 7).
      expect.any(Number),
    );
  });

  it("no sample for a run with a failed attempt (its duration holds the backoff sleeps), and the event still goes", async () => {
    trackRunStart({ matchId: "M1", phase: "bytes", bytesUploaded: 0, fileSizeBytes: 100 * MiB, resumed: false, trigger: "start" });
    trackAttemptFailed({ matchId: "M1", phase: "bytes", attempt: 1, offset: 0, status: 502, klass: "server", raw: "502" });
    now += 60_000;
    await trackUploaded({ matchId: "M1", fileSizeBytes: 100 * MiB, createdAt: T0 });
    expect(event()).toBeDefined();
    expect(mockRecordSample).not.toHaveBeenCalled();
  });

  it("no sample for a run too small or too short to say anything about the link", async () => {
    await landRun(1 * MiB, 60_000);
    await landRun(100 * MiB, 1_000);
    expect(mockRecordSample).not.toHaveBeenCalled();
  });

  it("no sample when NetInfo fails (no network class), and the event still goes", async () => {
    fetchMock.mockRejectedValue(new Error("native"));
    await landRun(100 * MiB, 60_000);
    expect(event()).toBeDefined();
    expect(mockRecordSample).not.toHaveBeenCalled();
  });

  it("still sends the event when the history write throws", async () => {
    mockRecordSample.mockImplementation(() => {
      throw new Error("storage");
    });
    await expect(landRun(100 * MiB, 60_000)).resolves.toBeUndefined();
    expect(event()).toBeDefined();
  });

  it("still sends the event when the history write rejects", async () => {
    mockRecordSample.mockRejectedValue(new Error("storage"));
    await expect(landRun(100 * MiB, 60_000)).resolves.toBeUndefined();
    expect(event()).toBeDefined();
  });
});

describe("trackCaptureBitrate", () => {
  it("one breadcrumb with the decision's fields", () => {
    trackCaptureBitrate({
      ...unmanagedDecision("720p", "history_good"),
      managed: true,
      bitrateBps: 3_000_000,
      codec: "hvc1",
      level: "normal",
      ladder: "hevc",
      network: "wifi",
      historyMedianMbps: 11,
      historySamples: 2,
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: "video.capture",
      message: "capture bitrate",
      level: "info",
      data: {
        bitrateBps: 3_000_000,
        codec: "hvc1",
        level: "normal",
        ladder: "hevc",
        reason: "history_good",
        network: "wifi",
        historyMedianMbps: 11,
        locationKnown: false,
        historyMatchedLocation: false,
        probeOutcome: "not_needed",
        probeMbps: null,
      },
    });
  });

  it("a throwing tracker never throws", () => {
    mockAddBreadcrumb.mockImplementation(() => {
      throw new Error("sentry");
    });
    expect(() => trackCaptureBitrate(unmanagedDecision("720p", "pending"))).not.toThrow();
  });
});

describe("phase 2 (dynamic capture bitrate 16.10, E13, E14)", () => {
  const HERE = { lat: 43.65, lng: -79.38 };
  /** A probe-decided decision at a known place, as the hook freezes it. */
  const decision = (network: "wifi" | "cellular") =>
    pickCaptureBitrate({
      platform: "ios",
      quality: "720p",
      disabled: false,
      reentry: false,
      codecs: ["hvc1"],
      network: { type: network, cellularGeneration: network === "cellular" ? "5g" : null, isInternetReachable: true },
      history: [],
      location: HERE,
      probe: { mbps: 21.37, network, at: T0 },
      now: T0,
    });

  async function land(network: "wifi" | "cellular", geoCell: typeof HERE | null) {
    const d = decision(network);
    trackRunStart({ matchId: "M1", phase: "bytes", bytesUploaded: 0, fileSizeBytes: 100 * MiB, resumed: false, trigger: "start" });
    now += 60_000;
    await trackUploaded({
      matchId: "M1",
      fileSizeBytes: 100 * MiB,
      createdAt: T0,
      captureBitrate: toPersistedCaptureBitrate(d),
      captureGeoCell: geoCell,
    });
    return d;
  }

  it("the uploaded event carries the four new fields and the probe tag", async () => {
    await land("cellular", HERE);
    expect(event().tags).toEqual(expect.objectContaining({ "video.capture.probe": "applied" }));
    expect(event().extra).toEqual(
      expect.objectContaining({
        captureReason: "probe_normal",
        captureLocationKnown: true,
        captureHistoryMatchedLocation: false,
        captureProbeOutcome: "applied",
        captureProbeMbps: 21.4,
      }),
    );
  });

  it("an older job (no phase 2 fields) or no decision: nulls and tag unknown", async () => {
    await landRun(100 * MiB, 60_000, {
      bitrateBps: 2_500_000,
      codec: "hvc1",
      level: "weak",
      ladder: "hevc",
      reason: "no_history_cellular",
      network: "cellular",
      historyMedianMbps: null,
    });
    expect(event().tags["video.capture.probe"]).toBe("unknown");
    expect(event().extra).toEqual(
      expect.objectContaining({
        captureLocationKnown: null,
        captureHistoryMatchedLocation: null,
        captureProbeOutcome: null,
        captureProbeMbps: null,
      }),
    );
  });

  it("the recording-start breadcrumb carries the four fields", () => {
    trackCaptureBitrate(decision("wifi"));
    expect(mockAddBreadcrumb.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ locationKnown: true, historyMatchedLocation: false, probeOutcome: "applied", probeMbps: 21.4 }),
    );
  });

  it("the upload sample gets the cell only when the upload ran on the decision's class (E13)", async () => {
    // NetInfo at landing: cellular (beforeEach).
    await land("cellular", HERE);
    expect(mockRecordSample).toHaveBeenLastCalledWith(
      expect.objectContaining({ network: "cellular", cell: HERE, source: "upload" }),
      expect.any(Number),
    );
    await land("wifi", HERE);
    expect(mockRecordSample).toHaveBeenLastCalledWith(expect.objectContaining({ network: "cellular", cell: null }), expect.any(Number));
    // No decision at all: no cell either.
    trackRunStart({ matchId: "M1", phase: "bytes", bytesUploaded: 0, fileSizeBytes: 100 * MiB, resumed: false, trigger: "start" });
    now += 60_000;
    await trackUploaded({ matchId: "M1", fileSizeBytes: 100 * MiB, createdAt: T0, captureGeoCell: HERE });
    expect(mockRecordSample).toHaveBeenLastCalledWith(expect.objectContaining({ cell: null }), expect.any(Number));
  });

  it("no telemetry call in a full flow ever carries the cell or a coordinate", async () => {
    const d = decision("cellular");
    expect(d.geoCell).toEqual(HERE);
    trackCaptureBitrate(d);
    await land("cellular", HERE);
    const all = [...mockAddBreadcrumb.mock.calls, ...mockCaptureMessage.mock.calls];
    expect(all.length).toBeGreaterThanOrEqual(2);
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
      }
    };
    walk(all);
    for (const banned of ["geoCell", "cell", "lat", "lng", "captureGeoCell", "location"]) expect(keys.has(banned)).toBe(false);
    const text = JSON.stringify(all);
    expect(text).not.toContain("43.65");
    expect(text).not.toContain("79.38");
  });
});

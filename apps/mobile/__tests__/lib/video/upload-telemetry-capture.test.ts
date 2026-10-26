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
import { unmanagedDecision } from "@/lib/video/capture-bitrate";

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
    expect(mockRecordSample).toHaveBeenCalledWith({
      ts: T0 + 80_000,
      network: "cellular",
      cellularGeneration: "5g",
      mbps: (100 * MiB * 8) / 80 / 1e6,
    });
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

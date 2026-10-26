/**
 * This phone's upload throughput history (lib/video/capture-bitrate-history.ts;
 * specs/dynamic-capture-bitrate 7.2, D3, D12, AC 4): capped, expiring,
 * self-healing, serialised, and never throwing.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CAPTURE_HISTORY_KEY,
  __resetCaptureHistoryForTests,
  loadThroughputHistory,
  recordThroughputSample,
  throughputSampleFromRun,
} from "@/lib/video/capture-bitrate-history";
import type { ThroughputSample } from "@/lib/video/capture-bitrate";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const MiB = 1024 * 1024;

const s = (ageMs: number, mbps = 10, network: ThroughputSample["network"] = "wifi"): ThroughputSample => ({
  ts: NOW - ageMs,
  network,
  cellularGeneration: null,
  mbps,
});

async function stored(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(CAPTURE_HISTORY_KEY);
  return raw == null ? null : JSON.parse(raw);
}

beforeEach(async () => {
  __resetCaptureHistoryForTests();
  await AsyncStorage.clear();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore();
});

describe("loadThroughputHistory", () => {
  it("missing key: []", async () => {
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([]);
  });

  it("corrupt JSON: [] and the key is removed", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, "{not json");
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([]);
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
  });

  it("a non-array: [] and the key is removed", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify({ ts: 1 }));
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([]);
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
  });

  it("malformed elements are dropped, valid ones kept", async () => {
    const good = s(1000);
    await AsyncStorage.setItem(
      CAPTURE_HISTORY_KEY,
      JSON.stringify([
        good,
        null,
        "x",
        { ...good, ts: "1" },
        { ...good, network: "none" },
        { ...good, network: "unknown" },
        { ...good, network: "carrier-pigeon" },
        { ...good, mbps: 0 },
        { ...good, mbps: -1 },
        { ...good, mbps: "9" },
        { ...good, cellularGeneration: 4 },
        { ...good, cellularGeneration: "4g" },
      ]),
    );
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([good, { ...good, cellularGeneration: "4g" }]);
  });

  it("drops samples older than 14 days and more than a minute in the future", async () => {
    const keep = [s(0), s(14 * DAY), s(-59_000)];
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify([...keep, s(14 * DAY + 1), s(-61_000)]));
    const out = await loadThroughputHistory(NOW);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.ts).sort()).toEqual(keep.map((x) => x.ts).sort());
  });

  it("returns at most the newest 5, newest first", async () => {
    const all = [s(7000), s(1000), s(3000), s(2000), s(6000), s(5000), s(4000)];
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify(all));
    const out = await loadThroughputHistory(NOW);
    expect(out.map((x) => NOW - x.ts)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("a storage read that throws: [] and no throw", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([]);
  });

  it("a failing self-heal removal does not throw", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, "garbage");
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([]);
  });
});

describe("recordThroughputSample", () => {
  it("prepends and keeps the newest 5 across all classes", async () => {
    for (let i = 6; i >= 1; i--) await recordThroughputSample(s(i * 1000, i, i % 2 ? "wifi" : "cellular"));
    const out = (await stored()) as ThroughputSample[];
    expect(out.map((x) => NOW - x.ts)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("drops expired samples on write", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify([s(20 * DAY)]));
    await recordThroughputSample(s(0));
    expect(await stored()).toEqual([s(0)]);
  });

  it("concurrent calls do not lose a sample", async () => {
    await Promise.all([recordThroughputSample(s(1000)), recordThroughputSample(s(2000)), recordThroughputSample(s(3000))]);
    expect(((await stored()) as ThroughputSample[]).map((x) => NOW - x.ts)).toEqual([1000, 2000, 3000]);
  });

  it("an invalid sample is not written", async () => {
    await recordThroughputSample({ ...s(0), mbps: Number.NaN });
    expect(await stored()).toBeNull();
  });

  it("a storage write that throws does not throw, and later writes still work", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("full"));
    await expect(recordThroughputSample(s(1000))).resolves.toBeUndefined();
    await recordThroughputSample(s(0));
    expect(await stored()).toEqual([s(0)]);
  });

  it("over a corrupt store: replaces it", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, "[[[");
    await recordThroughputSample(s(0));
    expect(await stored()).toEqual([s(0)]);
  });
});

describe("throughputSampleFromRun", () => {
  const run = (o: Partial<Parameters<typeof throughputSampleFromRun>[0]> = {}) =>
    throughputSampleFromRun({
      landedAt: NOW,
      bytesThisRun: 100 * MiB,
      durationMs: 100_000,
      backgroundedMs: 0,
      networkType: "wifi",
      cellularGeneration: null,
      ...o,
    });

  it("bytes x 8 / active seconds, in Mbps", () => {
    expect(run()).toEqual({ ts: NOW, network: "wifi", cellularGeneration: null, mbps: (100 * MiB * 8) / 100 / 1e6 });
  });

  it("excludes backgrounded time from the rate", () => {
    expect(run({ durationMs: 100_000, backgroundedMs: 50_000 })!.mbps).toBeCloseTo((100 * MiB * 8) / 50 / 1e6, 9);
  });

  it("null under 8 MiB sent", () => {
    expect(run({ bytesThisRun: 8 * MiB - 1 })).toBeNull();
    expect(run({ bytesThisRun: 8 * MiB })).not.toBeNull();
  });

  it("null under 5 s of foreground time", () => {
    expect(run({ durationMs: 60_000, backgroundedMs: 55_001 })).toBeNull();
    expect(run({ durationMs: 4_999 })).toBeNull();
    expect(run({ durationMs: 5_000 })).not.toBeNull();
  });

  it.each(["none", "unknown", null])("null for network %s", (networkType) => {
    expect(run({ networkType })).toBeNull();
  });

  it("classes: cellular keeps its generation, others pool into other", () => {
    expect(run({ networkType: "cellular", cellularGeneration: "5g" })).toEqual(
      expect.objectContaining({ network: "cellular", cellularGeneration: "5g" }),
    );
    expect(run({ networkType: "vpn" })!.network).toBe("other");
    expect(run({ networkType: "ethernet" })!.network).toBe("ethernet");
  });
});

/**
 * This phone's upload throughput history (lib/video/capture-bitrate-history.ts;
 * specs/dynamic-capture-bitrate 7.2, D3, D12, AC 4): capped, expiring,
 * self-healing, serialised, and never throwing.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CAPTURE_HISTORY_KEY,
  __resetCaptureHistoryForTests,
  clearThroughputHistory,
  loadThroughputHistory,
  throughputHistoryGeneration,
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
  cell: null,
  source: "upload",
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

  it("returns at most the newest 20 (phase 2, E3), newest first", async () => {
    const ages = Array.from({ length: 23 }, (_, i) => (i + 1) * 1000);
    const all = [...ages].reverse().map((a) => s(a));
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify(all));
    const out = await loadThroughputHistory(NOW);
    expect(out.map((x) => NOW - x.ts)).toEqual(ages.slice(0, 20));
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
  it("prepends and keeps the newest 20 across all classes", async () => {
    for (let i = 21; i >= 1; i--) await recordThroughputSample(s(i * 1000, i, i % 2 ? "wifi" : "cellular"));
    const out = (await stored()) as ThroughputSample[];
    expect(out.map((x) => NOW - x.ts)).toEqual(Array.from({ length: 20 }, (_, i) => (i + 1) * 1000));
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
    expect(run()).toEqual({
      ts: NOW,
      network: "wifi",
      cellularGeneration: null,
      mbps: (100 * MiB * 8) / 100 / 1e6,
      cell: null,
      source: "upload",
    });
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

describe("phase 2: cell and source (E1, E3, E12, E14)", () => {
  const HERE = { lat: 43.65, lng: -79.38 };

  it("phase 1 samples (no cell, no source) load as cell null, source upload", async () => {
    const old = { ts: NOW - 1000, network: "wifi", cellularGeneration: null, mbps: 12 };
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify([old]));
    await expect(loadThroughputHistory(NOW)).resolves.toEqual([{ ...old, cell: null, source: "upload" }]);
  });

  it.each([
    ["a string", "43.65,-79.38"],
    ["NaN lat", { lat: "x", lng: 1 }],
    ["out of range", { lat: 95, lng: 0 }],
    ["missing lng", { lat: 43.65 }],
  ])("an invalid cell (%s) becomes null and the sample is kept", async (_name, cell) => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify([{ ...s(1000), cell }]));
    const out = await loadThroughputHistory(NOW);
    expect(out).toHaveLength(1);
    expect(out[0].cell).toBeNull();
  });

  it("a stored cell is re-rounded on load (never more precise than about 1 km)", async () => {
    await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify([{ ...s(1000), cell: { lat: 43.65432, lng: -79.38321 } }]));
    expect((await loadThroughputHistory(NOW))[0].cell).toEqual(HERE);
  });

  it("source: probe is kept, anything else reads as upload", async () => {
    await AsyncStorage.setItem(
      CAPTURE_HISTORY_KEY,
      JSON.stringify([{ ...s(1000), source: "probe" }, { ...s(2000), source: "radar" }, { ...s(3000), source: 7 }]),
    );
    expect((await loadThroughputHistory(NOW)).map((x) => x.source)).toEqual(["probe", "upload", "upload"]);
  });

  it("a recorded probe sample keeps its cell and source", async () => {
    await recordThroughputSample({ ...s(0), cell: HERE, source: "probe" });
    expect(await stored()).toEqual([{ ...s(0), cell: HERE, source: "probe" }]);
  });

  it("clearThroughputHistory removes the key", async () => {
    await recordThroughputSample(s(0));
    await clearThroughputHistory();
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
  });

  it("clearThroughputHistory is serialised with writes: a write queued before it never survives it", async () => {
    const write = recordThroughputSample(s(0));
    const clear = clearThroughputHistory();
    await Promise.all([write, clear]);
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
    // A write queued after it lands.
    await recordThroughputSample(s(500));
    expect(await stored()).toEqual([s(500)]);
  });

  it("clearThroughputHistory never throws", async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(clearThroughputHistory()).resolves.toBeUndefined();
  });

  it("throughputSampleFromRun copies the cell with source upload", () => {
    const sample = throughputSampleFromRun({
      landedAt: NOW,
      bytesThisRun: 100 * MiB,
      durationMs: 100_000,
      backgroundedMs: 0,
      networkType: "wifi",
      cellularGeneration: null,
      cell: HERE,
    });
    expect(sample).toEqual(expect.objectContaining({ cell: HERE, source: "upload" }));
  });
});

// Phase 2 review NIT 7: a measurement from the previous session never lands
// in the next one.
describe("history generation (sign-out race)", () => {
  it("a sample measured before a clear is dropped, even when its write is queued after the clear", async () => {
    const before = throughputHistoryGeneration();
    await clearThroughputHistory();
    expect(throughputHistoryGeneration()).toBe(before + 1);
    await recordThroughputSample(s(0), before);
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
  });

  it("a write queued before the clear with the old generation is dropped too", async () => {
    const before = throughputHistoryGeneration();
    const write = recordThroughputSample(s(0), before);
    const clear = clearThroughputHistory();
    await Promise.all([write, clear]);
    await expect(AsyncStorage.getItem(CAPTURE_HISTORY_KEY)).resolves.toBeNull();
  });

  it("a sample measured in the new session is written", async () => {
    await clearThroughputHistory();
    await recordThroughputSample(s(0), throughputHistoryGeneration());
    expect(await stored()).toEqual([s(0)]);
  });
});

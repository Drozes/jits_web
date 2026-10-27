/**
 * The capture bitrate picker (lib/video/capture-bitrate.ts; specs/
 * dynamic-capture-bitrate section 6, AC 1 to 3): every branch of 6.3 with its
 * exact reason, the owner's value table, and the floor.
 */
import {
  CAPTURE_BITRATE_LEVELS,
  CAPTURE_HISTORY_MAX_SAMPLES,
  CAPTURE_LOCATION_GRID_DEG,
  CAPTURE_LOCATION_MATCH_M,
  CAPTURE_PROBE_MAX_AGE_MS,
  CAPTURE_PROBE_OFF_FLAG,
  captureProbeNeeded,
  coarseGeoCell,
  geoCellDistanceM,
  isSameArea,
  type CaptureGeoCell,
  type CaptureProbeInput,
  CAPTURE_BITRATE_OFF_FLAG,
  CAPTURE_HISTORY_MAX_AGE_MS,
  CAPTURE_NORMAL_MIN_MBPS,
  captureNetworkClassOf,
  medianMbps,
  pickCaptureBitrate,
  unmanagedDecision,
  type CaptureBitrateDecision,
  type CaptureBitrateInput,
  type CaptureBitrateLevels,
  type CaptureNetworkSnapshot,
  type ThroughputSample,
} from "@/lib/video/capture-bitrate";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const WIFI: CaptureNetworkSnapshot = { type: "wifi", cellularGeneration: null, isInternetReachable: true };
const cell = (gen: string | null): CaptureNetworkSnapshot => ({ type: "cellular", cellularGeneration: gen, isInternetReachable: true });

function sample(network: ThroughputSample["network"], mbps: number, ageMs = DAY): ThroughputSample {
  return { ts: NOW - ageMs, network, cellularGeneration: null, mbps, cell: null, source: "upload" };
}

function input(overrides: Partial<CaptureBitrateInput> = {}): CaptureBitrateInput {
  return {
    platform: "ios",
    quality: "720p",
    disabled: false,
    reentry: false,
    codecs: ["hvc1", "avc1"],
    network: WIFI,
    history: [],
    location: null,
    probe: null,
    now: NOW,
    ...overrides,
  };
}

const pick = (o: Partial<CaptureBitrateInput> = {}) => pickCaptureBitrate(input(o));

/** A Toronto gym's cell, and one sample there (phase 2). */
const HERE: CaptureGeoCell = { lat: 43.65, lng: -79.38 };
const LOCATIONS: (CaptureGeoCell | null)[] = [null, HERE];
const PROBES: (CaptureProbeInput | null)[] = [
  null,
  { mbps: 0.5, network: "wifi", at: NOW },
  { mbps: 50, network: "cellular", at: NOW },
];

describe("constants", () => {
  it("the kill switch key and the threshold", () => {
    expect(CAPTURE_BITRATE_OFF_FLAG).toBe("match_capture_bitrate_off");
    expect(CAPTURE_NORMAL_MIN_MBPS).toBe(8);
    expect(CAPTURE_HISTORY_MAX_AGE_MS).toBe(14 * DAY);
  });
});

describe("step 1: the kill switch", () => {
  it("disabled: unmanaged, reason disabled, even with everything else known", () => {
    const d = pick({ disabled: true, history: [sample("wifi", 20), sample("wifi", 20)] });
    expect(d).toEqual(
      expect.objectContaining({ managed: false, bitrateBps: null, codec: null, level: null, ladder: null, reason: "disabled" }),
    );
    expect(d.network).toBe("wifi");
  });

  it("disabled wins over re-entry and Android", () => {
    expect(pick({ disabled: true, reentry: true, platform: "android" }).reason).toBe("disabled");
  });
});

describe("step 2: ladder and codec", () => {
  it("iOS, codecs unknown: unmanaged, ios_codec_unknown", () => {
    expect(pick({ codecs: null })).toEqual(expect.objectContaining({ managed: false, reason: "ios_codec_unknown", codec: null }));
  });

  it("iOS, hvc1 listed: the HEVC ladder with codec hvc1", () => {
    expect(pick()).toEqual(expect.objectContaining({ managed: true, ladder: "hevc", codec: "hvc1", bitrateBps: 3_000_000 }));
  });

  it("iOS, only avc1: the H.264 ladder with codec avc1 and the H.264 values", () => {
    expect(pick({ codecs: ["avc1", "jpeg"] })).toEqual(
      expect.objectContaining({ managed: true, ladder: "h264", codec: "avc1", bitrateBps: 4_000_000 }),
    );
  });

  it("iOS, neither: unmanaged, ios_no_supported_codec", () => {
    expect(pick({ codecs: ["jpeg", "apcn"] })).toEqual(expect.objectContaining({ managed: false, reason: "ios_no_supported_codec" }));
    expect(pick({ codecs: [] }).reason).toBe("ios_no_supported_codec");
  });

  it("Android: always H.264 and no codec, even when codecs lists hvc1 or is null", () => {
    for (const codecs of [["hvc1", "avc1"], null]) {
      expect(pick({ platform: "android", codecs })).toEqual(
        expect.objectContaining({ managed: true, ladder: "h264", codec: null, bitrateBps: 4_000_000 }),
      );
    }
  });

  it("any other platform follows the Android rules", () => {
    expect(pick({ platform: "web", codecs: null })).toEqual(expect.objectContaining({ ladder: "h264", codec: null }));
  });
});

describe("steps 3 to 7: weak conditions, in order", () => {
  it.each(["ios", "android"])("%s re-entry: weak, before any network check", (platform) => {
    const d = pick({ platform, reentry: true, network: null, history: [sample("wifi", 50), sample("wifi", 50)] });
    expect(d).toEqual(expect.objectContaining({ managed: true, level: "weak", reason: "reentry", historySamples: 0 }));
  });

  it("no NetInfo snapshot: weak, network_unknown", () => {
    expect(pick({ network: null })).toEqual(expect.objectContaining({ level: "weak", reason: "network_unknown", network: "unknown" }));
  });

  it("type unknown or null: weak, network_unknown", () => {
    expect(pick({ network: { type: "unknown", cellularGeneration: null, isInternetReachable: null } }).reason).toBe("network_unknown");
    expect(pick({ network: { type: null, cellularGeneration: null, isInternetReachable: true } }).reason).toBe("network_unknown");
  });

  it("type none: weak, offline", () => {
    expect(pick({ network: { type: "none", cellularGeneration: null, isInternetReachable: false } })).toEqual(
      expect.objectContaining({ level: "weak", reason: "offline", network: "none" }),
    );
  });

  it("isInternetReachable false: weak, no_internet, even with good history", () => {
    const d = pick({ network: { ...WIFI, isInternetReachable: false }, history: [sample("wifi", 30), sample("wifi", 30)] });
    expect(d).toEqual(expect.objectContaining({ level: "weak", reason: "no_internet", historySamples: 0, historyMedianMbps: null }));
  });

  it("isInternetReachable null (not yet known) does not trigger it", () => {
    expect(pick({ network: { ...WIFI, isInternetReachable: null } })).toEqual(
      expect.objectContaining({ level: "normal", reason: "no_history_wifi" }),
    );
  });

  it.each(["2g", "3g"])("cellular %s: weak, cellular_slow_gen, even with good history", (gen) => {
    const d = pick({ network: cell(gen), history: [sample("cellular", 30), sample("cellular", 30)] });
    expect(d).toEqual(expect.objectContaining({ level: "weak", reason: "cellular_slow_gen", cellularGeneration: gen }));
  });
});

describe("step 8: history", () => {
  it.each(["4g", "5g"])("cellular %s with good history: normal", (gen) => {
    const d = pick({ network: cell(gen), history: [sample("cellular", 10), sample("cellular", 12)] });
    expect(d).toEqual(expect.objectContaining({ level: "normal", reason: "history_good", historyMedianMbps: 11, historySamples: 2 }));
  });

  it.each(["4g", "5g"])("cellular %s with weak history: weak", (gen) => {
    const d = pick({ network: cell(gen), history: [sample("cellular", 3), sample("cellular", 4)] });
    expect(d).toEqual(expect.objectContaining({ level: "weak", reason: "history_weak", historyMedianMbps: 3.5 }));
  });

  it("median exactly 8: normal; 7.99: weak", () => {
    expect(pick({ history: [sample("wifi", 8), sample("wifi", 8)] }).reason).toBe("history_good");
    expect(pick({ history: [sample("wifi", 7.99), sample("wifi", 7.99), sample("wifi", 7.99)] }).reason).toBe("history_weak");
  });

  it("an even count takes the mean of the two middle values", () => {
    // Sorted 2, 6, 10, 40: middle mean 8 = normal (the plain mean 14.5 would also be; the lower middle alone would not).
    const d = pick({ history: [sample("wifi", 40), sample("wifi", 2), sample("wifi", 10), sample("wifi", 6)] });
    expect(d).toEqual(expect.objectContaining({ historyMedianMbps: 8, reason: "history_good", historySamples: 4 }));
  });

  it("history on a different class is ignored", () => {
    const d = pick({ history: [sample("cellular", 1), sample("cellular", 1), sample("ethernet", 1)] });
    expect(d).toEqual(expect.objectContaining({ reason: "no_history_wifi", level: "normal", historySamples: 0 }));
  });

  it("samples older than 14 days are ignored; exactly 14 days still counts", () => {
    const old = [sample("wifi", 1, 14 * DAY + 1), sample("wifi", 1, 15 * DAY)];
    expect(pick({ history: old }).reason).toBe("no_history_wifi");
    expect(pick({ history: [sample("wifi", 1, 14 * DAY), sample("wifi", 1)] }).reason).toBe("history_weak");
  });

  it("samples more than a minute in the future (the store's tolerance too) and non-positive or non-finite ones are ignored", () => {
    const bad = [sample("wifi", 1, -61_000), sample("wifi", 0), sample("wifi", -3), sample("wifi", Number.NaN), sample("wifi", Infinity)];
    expect(pick({ history: bad })).toEqual(expect.objectContaining({ reason: "no_history_wifi", historySamples: 0 }));
  });

  it("a sample up to a minute ahead (clock skew) counts, as the store keeps it", () => {
    expect(pick({ history: [sample("wifi", 1, -60_000), sample("wifi", 1)] }).reason).toBe("history_weak");
  });

  it("a single matching sample is not usable, but is reported", () => {
    const d = pick({ history: [sample("wifi", 1)] });
    expect(d).toEqual(expect.objectContaining({ reason: "no_history_wifi", level: "normal", historySamples: 1, historyMedianMbps: null }));
  });
});

describe("step 9: no usable history", () => {
  it("wifi: normal", () => {
    expect(pick()).toEqual(expect.objectContaining({ level: "normal", reason: "no_history_wifi" }));
  });

  it("ethernet: normal", () => {
    expect(pick({ network: { type: "ethernet", cellularGeneration: null, isInternetReachable: true } })).toEqual(
      expect.objectContaining({ level: "normal", reason: "no_history_ethernet", network: "ethernet" }),
    );
  });

  it.each([null, "4g", "5g"])("cellular (generation %s): weak", (gen) => {
    expect(pick({ network: cell(gen) })).toEqual(expect.objectContaining({ level: "weak", reason: "no_history_cellular" }));
  });

  it.each(["vpn", "bluetooth", "wimax", "other"])("other (%s): weak", (type) => {
    const d = pick({ network: { type, cellularGeneration: null, isInternetReachable: true } });
    expect(d).toEqual(expect.objectContaining({ level: "weak", reason: "no_history_other", network: "other" }));
  });

  it("other with good history on the other class: normal", () => {
    const d = pick({ network: { type: "vpn", cellularGeneration: null, isInternetReachable: true }, history: [sample("other", 9), sample("other", 9)] });
    expect(d.reason).toBe("history_good");
  });
});

describe("the value table (spec section 3)", () => {
  const cases: [string, Partial<CaptureBitrateInput>, "720p" | "1080p", "normal" | "weak", number][] = [
    ["iOS HEVC", {}, "720p", "normal", 3_000_000],
    ["iOS HEVC", {}, "720p", "weak", 2_500_000],
    ["iOS HEVC", {}, "1080p", "normal", 4_500_000],
    ["iOS HEVC", {}, "1080p", "weak", 4_000_000],
    ["Android H.264", { platform: "android" }, "720p", "normal", 4_000_000],
    ["Android H.264", { platform: "android" }, "720p", "weak", 3_000_000],
    ["Android H.264", { platform: "android" }, "1080p", "normal", 6_000_000],
    ["Android H.264", { platform: "android" }, "1080p", "weak", 5_000_000],
  ];
  it.each(cases)("%s %s %s = %d", (_name, o, quality, level, bps) => {
    const d = pick({ ...o, quality, network: level === "normal" ? WIFI : cell(null) });
    expect(d).toEqual(expect.objectContaining({ managed: true, quality, level, bitrateBps: bps, clamped: false }));
  });

  it("the iOS avc1 fallback uses the H.264 values at 1080p too", () => {
    expect(pick({ codecs: ["avc1"], quality: "1080p" }).bitrateBps).toBe(6_000_000);
    expect(pick({ codecs: ["avc1"], quality: "1080p", network: cell(null) }).bitrateBps).toBe(5_000_000);
  });

  it("no decision is ever below its floor (every input above, both qualities, both platforms)", () => {
    const networks: (CaptureNetworkSnapshot | null)[] = [
      null,
      WIFI,
      cell("2g"),
      cell("3g"),
      cell("4g"),
      cell("5g"),
      cell(null),
      { type: "none", cellularGeneration: null, isInternetReachable: false },
      { type: "ethernet", cellularGeneration: null, isInternetReachable: true },
      { type: "vpn", cellularGeneration: null, isInternetReachable: true },
      { ...WIFI, isInternetReachable: false },
      { ...WIFI, isInternetReachable: null },
    ];
    const histories: ThroughputSample[][] = [
      [],
      [sample("wifi", 1), sample("wifi", 2)],
      [sample("wifi", 50), sample("wifi", 60)],
      [sample("cellular", 0.5), sample("cellular", 0.7)],
      [sample("cellular", 30), sample("cellular", 40)],
    ];
    const codecLists = [null, ["hvc1"], ["avc1"], ["hvc1", "avc1"], []];
    let managed = 0;
    for (const platform of ["ios", "android"])
      for (const quality of ["720p", "1080p"] as const)
        for (const network of networks)
          for (const history of histories)
            for (const codecs of codecLists)
              for (const reentry of [false, true])
                for (const location of LOCATIONS)
                  for (const probe of PROBES) {
                const d: CaptureBitrateDecision = pick({ platform, quality, network, history, codecs, reentry, location, probe });
                if (!d.managed) {
                  expect(d.bitrateBps).toBeNull();
                  continue;
                }
                managed += 1;
                const floor = CAPTURE_BITRATE_LEVELS[d.ladder!][quality].floor;
                expect(d.bitrateBps!).toBeGreaterThanOrEqual(floor);
                if (platform === "android") expect(d.codec).toBeNull();
              }
    expect(managed).toBeGreaterThan(0);
  });
});

describe("the floor clamp and a broken table", () => {
  const base = (): CaptureBitrateLevels => JSON.parse(JSON.stringify(CAPTURE_BITRATE_LEVELS));

  it("weak below the floor: the floor, clamped", () => {
    const levels = base();
    levels.hevc["720p"] = { normal: 3_000_000, weak: 1_000_000, floor: 2_000_000 };
    const d = pick({ levels, network: cell(null) });
    expect(d).toEqual(expect.objectContaining({ managed: true, bitrateBps: 2_000_000, clamped: true, level: "weak" }));
  });

  it("normal below the floor: the floor, clamped", () => {
    const levels = base();
    levels.h264["1080p"] = { normal: 4_000_000, weak: 3_000_000, floor: 5_000_000 };
    expect(pick({ levels, platform: "android", quality: "1080p" })).toEqual(
      expect.objectContaining({ bitrateBps: 5_000_000, clamped: true }),
    );
  });

  it.each([
    ["NaN", { normal: Number.NaN, weak: 2_500_000, floor: 2_000_000 }],
    ["zero", { normal: 3_000_000, weak: 0, floor: 2_000_000 }],
    ["negative floor", { normal: 3_000_000, weak: 2_500_000, floor: -1 }],
    ["fractional", { normal: 3_000_000.5, weak: 2_500_000, floor: 2_000_000 }],
  ])("an invalid set (%s): unmanaged, keeping the reason", (_name, set) => {
    const levels = base();
    levels.hevc["720p"] = set;
    expect(pick({ levels })).toEqual(expect.objectContaining({ managed: false, bitrateBps: null, codec: null, reason: "no_history_wifi" }));
  });

  it("a missing quality: unmanaged", () => {
    const levels = base();
    delete (levels.hevc as Partial<CaptureBitrateLevels["hevc"]>)["1080p"];
    expect(pick({ levels, quality: "1080p" }).managed).toBe(false);
  });

  it("a missing ladder: unmanaged, with the history fields kept", () => {
    const levels = base();
    delete (levels as Partial<CaptureBitrateLevels>).h264;
    const d = pick({ levels, platform: "android", history: [sample("wifi", 1), sample("wifi", 3)] });
    expect(d).toEqual(expect.objectContaining({ managed: false, reason: "history_weak", historyMedianMbps: 2, historySamples: 2 }));
  });
});

describe("helpers", () => {
  it("unmanagedDecision is today's recording", () => {
    expect(unmanagedDecision("1080p", "pending")).toEqual({
      managed: false,
      bitrateBps: null,
      codec: null,
      level: null,
      ladder: null,
      quality: "1080p",
      reason: "pending",
      clamped: false,
      network: "unknown",
      cellularGeneration: null,
      historyMedianMbps: null,
      historySamples: 0,
      locationKnown: false,
      historyMatchedLocation: false,
      probeMbps: null,
      probeOutcome: "not_needed",
      geoCell: null,
    });
  });

  it("captureNetworkClassOf", () => {
    const of = (type: string | null) => captureNetworkClassOf({ type, cellularGeneration: null, isInternetReachable: null });
    expect(captureNetworkClassOf(null)).toBe("unknown");
    expect(of(null)).toBe("unknown");
    expect(of("unknown")).toBe("unknown");
    expect(of("none")).toBe("none");
    expect(of("wifi")).toBe("wifi");
    expect(of("ethernet")).toBe("ethernet");
    expect(of("cellular")).toBe("cellular");
    expect(of("bluetooth")).toBe("other");
    expect(of("wimax")).toBe("other");
  });

  it("medianMbps", () => {
    expect(medianMbps([])).toBeNull();
    expect(medianMbps([sample("wifi", 5)])).toBe(5);
    expect(medianMbps([sample("wifi", 9), sample("wifi", 1), sample("wifi", 4)])).toBe(4);
    expect(medianMbps([sample("wifi", 1), sample("wifi", 3)])).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (spec 16): location-aware history and the background probe.
// ---------------------------------------------------------------------------

/** About `m` metres north of `c` (1 degree of latitude = 111,195 m on R = 6,371 km). */
const north = (c: CaptureGeoCell, m: number): CaptureGeoCell => ({ lat: c.lat + m / 111_195, lng: c.lng });
const at = (s: ThroughputSample, cellAt: CaptureGeoCell | null): ThroughputSample => ({ ...s, cell: cellAt });
const probe = (mbps: number, network: CaptureProbeInput["network"] = "wifi", ageMs = 0): CaptureProbeInput => ({
  mbps,
  network,
  at: NOW - ageMs,
});

describe("phase 2 constants", () => {
  it("the probe switch, the cap, the radius and the grid", () => {
    expect(CAPTURE_PROBE_OFF_FLAG).toBe("match_capture_probe_off");
    expect(CAPTURE_HISTORY_MAX_SAMPLES).toBe(20);
    expect(CAPTURE_LOCATION_MATCH_M).toBe(1_600);
    expect(CAPTURE_LOCATION_GRID_DEG).toBe(0.01);
    expect(CAPTURE_PROBE_MAX_AGE_MS).toBe(10 * 60 * 1000);
  });
});

describe("coarseGeoCell, geoCellDistanceM, isSameArea (E1, E2)", () => {
  it("rounds to 2 decimals", () => {
    expect(coarseGeoCell(43.65432, -79.38765)).toEqual({ lat: 43.65, lng: -79.39 });
    expect(coarseGeoCell(43.6449, -79.3851)).toEqual({ lat: 43.64, lng: -79.39 });
  });

  it("normalises -0 to 0", () => {
    const c = coarseGeoCell(-0.001, -0.004)!;
    expect(Object.is(c.lat, 0)).toBe(true);
    expect(Object.is(c.lng, 0)).toBe(true);
  });

  it.each([
    ["NaN", Number.NaN, 0],
    ["Infinity", 0, Number.POSITIVE_INFINITY],
    ["lat > 90", 90.01, 0],
    ["lat < -90", -91, 0],
    ["lng > 180", 0, 180.5],
    ["lng < -180", 0, -181],
  ])("rejects %s", (_name, lat, lng) => {
    expect(coarseGeoCell(lat, lng)).toBeNull();
  });

  it("accepts the range edges", () => {
    expect(coarseGeoCell(90, 180)).toEqual({ lat: 90, lng: 180 });
    expect(coarseGeoCell(-90, -180)).toEqual({ lat: -90, lng: -180 });
  });

  it("haversine against two reference distances (within 1 percent)", () => {
    // 0.01 degree of latitude: R * 0.01 * pi / 180 = 1,111.95 m.
    expect(geoCellDistanceM({ lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.38 })).toBeCloseTo(1111.95, 0);
    // London to Paris: 343.56 km.
    const lp = geoCellDistanceM({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 });
    expect(Math.abs(lp - 343_560) / 343_560).toBeLessThan(0.01);
    expect(geoCellDistanceM(HERE, HERE)).toBe(0);
  });

  it("isSameArea: both known and within 1,600 m", () => {
    expect(isSameArea(HERE, north(HERE, 1_590))).toBe(true);
    expect(isSameArea(HERE, north(HERE, 1_700))).toBe(false);
    expect(isSameArea(null, HERE)).toBe(false);
    expect(isSameArea(HERE, null)).toBe(false);
    expect(isSameArea(null, null)).toBe(false);
  });

  it("two readings 50 m apart that round to adjacent cells still match (also diagonally)", () => {
    const a = coarseGeoCell(43.65495, -79.38495)!;
    const b = coarseGeoCell(43.65505 + 0.0004, -79.38505 - 0.0002)!;
    expect(a).toEqual({ lat: 43.65, lng: -79.38 });
    expect(b).toEqual({ lat: 43.66, lng: -79.39 });
    expect(isSameArea(a, b)).toBe(true);
  });
});

describe("step 8 with a location (E4)", () => {
  it("2 same-class samples within 1,600 m decide, location-matched", () => {
    const d = pick({ location: HERE, history: [at(sample("wifi", 20), HERE), at(sample("wifi", 30), north(HERE, 1_500))] });
    expect(d).toEqual(
      expect.objectContaining({ reason: "history_good", historyMatchedLocation: true, locationKnown: true, historySamples: 2, geoCell: HERE }),
    );
  });

  it("weak history here decides weak", () => {
    const d = pick({ location: HERE, history: [at(sample("wifi", 2), HERE), at(sample("wifi", 3), HERE)] });
    expect(d).toEqual(expect.objectContaining({ reason: "history_weak", level: "weak", historyMatchedLocation: true }));
  });

  it("samples 1,700 m away are ignored: wifi falls to the first-time rule (normal), even with far samples", () => {
    const far = north(HERE, 1_700);
    const d = pick({ location: HERE, history: [at(sample("wifi", 1), far), at(sample("wifi", 1), far), at(sample("wifi", 1), far)] });
    expect(d).toEqual(
      expect.objectContaining({ reason: "no_history_wifi", level: "normal", historyMatchedLocation: false, historySamples: 0 }),
    );
  });

  it("cellular with only far samples: no_history_cellular (weak), even when the far ones are good", () => {
    const far = north(HERE, 1_700);
    const d = pick({
      location: HERE,
      network: cell("5g"),
      history: [at(sample("cellular", 40), far), at(sample("cellular", 50), far)],
    });
    expect(d).toEqual(expect.objectContaining({ reason: "no_history_cellular", level: "weak", historyMatchedLocation: false }));
  });

  it("a sample with no cell never matches a known cell", () => {
    const d = pick({ location: HERE, history: [sample("wifi", 1), sample("wifi", 1)] });
    expect(d).toEqual(expect.objectContaining({ reason: "no_history_wifi", historyMatchedLocation: false, historySamples: 0 }));
  });

  it("one sample here plus far ones: unknown here (no fallback to other places)", () => {
    const far = north(HERE, 5_000);
    const d = pick({
      location: HERE,
      history: [at(sample("wifi", 1), HERE), at(sample("wifi", 1), far), at(sample("wifi", 1), far)],
    });
    expect(d).toEqual(expect.objectContaining({ reason: "no_history_wifi", historySamples: 1, historyMatchedLocation: false }));
  });

  it("location unknown: class-level history across every place, exactly as phase 1", () => {
    const far = north(HERE, 50_000);
    const history = [at(sample("wifi", 1), HERE), at(sample("wifi", 2), far)];
    const d = pick({ location: null, history });
    expect(d).toEqual(
      expect.objectContaining({ reason: "history_weak", locationKnown: false, historyMatchedLocation: false, historySamples: 2, geoCell: null }),
    );
    // Same answer as with the cells stripped (phase 1 samples).
    const phase1 = pick({ location: null, history: history.map((s) => at(s, null)) });
    expect({ ...phase1, geoCell: null }).toEqual(d);
  });
});

describe("step 7b: the probe (E7, E10)", () => {
  it("8.0 Mbps: probe_normal; 7.99: probe_weak", () => {
    expect(pick({ probe: probe(8) })).toEqual(
      expect.objectContaining({ reason: "probe_normal", level: "normal", probeMbps: 8, probeOutcome: "applied" }),
    );
    expect(pick({ probe: probe(7.99) })).toEqual(
      expect.objectContaining({ reason: "probe_weak", level: "weak", probeMbps: 7.99, probeOutcome: "applied" }),
    );
  });

  it("overrides good and weak location-matched history, still reporting the history fields", () => {
    const good = [at(sample("wifi", 30), HERE), at(sample("wifi", 40), HERE)];
    const weak = [at(sample("wifi", 1), HERE), at(sample("wifi", 2), HERE)];
    expect(pick({ location: HERE, history: good, probe: probe(2) })).toEqual(
      expect.objectContaining({ reason: "probe_weak", historyMatchedLocation: true, historyMedianMbps: 35, historySamples: 2 }),
    );
    expect(pick({ location: HERE, history: weak, probe: probe(20) })).toEqual(
      expect.objectContaining({ reason: "probe_normal", historyMatchedLocation: true, historyMedianMbps: 1.5 }),
    );
  });

  it("overrides class-level history (no location)", () => {
    const d = pick({ history: [sample("wifi", 30), sample("wifi", 40)], probe: probe(1) });
    expect(d).toEqual(expect.objectContaining({ reason: "probe_weak", historyMedianMbps: 35, historyMatchedLocation: false }));
  });

  it("overrides the first-time rule on cellular", () => {
    expect(pick({ network: cell("4g"), probe: probe(20, "cellular") })).toEqual(
      expect.objectContaining({ reason: "probe_normal", level: "normal" }),
    );
  });

  it.each<[string, Partial<CaptureBitrateInput>, string]>([
    ["disabled", { disabled: true }, "disabled"],
    ["iOS codec unknown", { codecs: null }, "ios_codec_unknown"],
    ["reentry", { reentry: true }, "reentry"],
    ["network unknown", { network: null }, "network_unknown"],
    ["offline", { network: { type: "none", cellularGeneration: null, isInternetReachable: false } }, "offline"],
    ["no internet", { network: { ...WIFI, isInternetReachable: false } }, "no_internet"],
    ["cellular 3g", { network: cell("3g") }, "cellular_slow_gen"],
  ])("does not override %s", (_name, overrides, reason) => {
    const network = overrides.network === undefined ? WIFI : overrides.network;
    const cls = captureNetworkClassOf(network);
    const d = pick({ ...overrides, probe: probe(50, cls) });
    expect(d.reason).toBe(reason);
    expect(d.probeMbps).toBeNull();
    expect(d.probeOutcome).toBe("not_needed");
  });

  it("a probe on another class (the network changed) is ignored, with outcome ignored", () => {
    expect(pick({ probe: probe(50, "cellular") })).toEqual(
      expect.objectContaining({ reason: "no_history_wifi", probeMbps: null, probeOutcome: "ignored" }),
    );
  });

  it("a probe older than 10 minutes is stale (outcome stale); exactly 10 minutes still counts", () => {
    expect(pick({ probe: probe(1, "wifi", CAPTURE_PROBE_MAX_AGE_MS + 1) })).toEqual(
      expect.objectContaining({ reason: "no_history_wifi", probeMbps: null, probeOutcome: "stale" }),
    );
    expect(pick({ probe: probe(1, "wifi", CAPTURE_PROBE_MAX_AGE_MS) }).reason).toBe("probe_weak");
  });

  it("a probe stamped after now is fresh (it ends after the inputs were read): no future check", () => {
    expect(pick({ probe: probe(1, "wifi", -61_000) })).toEqual(expect.objectContaining({ reason: "probe_weak", probeOutcome: "applied" }));
    expect(pick({ probe: probe(20, "wifi", -15 * 60_000) }).reason).toBe("probe_normal");
  });

  it("a non-positive or non-finite probe is ignored", () => {
    for (const mbps of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pick({ probe: probe(mbps) }).reason).toBe("no_history_wifi");
    }
  });

  it("probeMbps and probeOutcome applied only when the probe decided", () => {
    const d = pick({ history: [sample("wifi", 30), sample("wifi", 40)] });
    expect(d).toEqual(expect.objectContaining({ reason: "history_good", probeMbps: null, probeOutcome: "not_needed" }));
  });
});

describe("captureProbeNeeded (E6, the input-only part)", () => {
  const needed = (o: Partial<CaptureBitrateInput> = {}) => {
    const { probe: _probe, ...rest } = input(o);
    return captureProbeNeeded(rest);
  };
  const here2 = [at(sample("wifi", 30), HERE), at(sample("wifi", 40), HERE)];

  it.each(["4g", "5g", null])("cellular %s: true, with or without location-matched history", (gen) => {
    expect(needed({ network: cell(gen) })).toBe(true);
    const cellHere = [at(sample("cellular", 30), HERE), at(sample("cellular", 40), HERE)];
    expect(needed({ network: cell(gen), location: HERE, history: cellHere })).toBe(true);
  });

  it("wifi, ethernet and other without location-matched history: true", () => {
    for (const type of ["wifi", "ethernet", "vpn"]) {
      const network = { type, cellularGeneration: null, isInternetReachable: true };
      expect(needed({ network })).toBe(true);
      expect(needed({ network, location: HERE })).toBe(true);
      // One sample here is not "known here".
      expect(needed({ network, location: HERE, history: [at(sample("wifi", 30), HERE)] })).toBe(true);
    }
    // Class-level history without a location does not count as "here".
    expect(needed({ history: [sample("wifi", 30), sample("wifi", 40)] })).toBe(true);
  });

  it("wifi with 2 samples here: false", () => {
    expect(needed({ location: HERE, history: here2 })).toBe(false);
  });

  it.each<[string, Partial<CaptureBitrateInput>]>([
    ["disabled", { disabled: true }],
    ["reentry", { reentry: true }],
    ["network unknown", { network: null }],
    ["offline", { network: { type: "none", cellularGeneration: null, isInternetReachable: false } }],
    ["no internet", { network: { ...WIFI, isInternetReachable: false } }],
    ["cellular 2g", { network: cell("2g") }],
    ["cellular 3g", { network: cell("3g") }],
    ["iOS codecs null", { codecs: null }],
    ["iOS no supported codec", { codecs: [] }],
  ])("false when %s", (_name, overrides) => {
    expect(needed(overrides)).toBe(false);
  });

  it("Android ignores the codec list", () => {
    expect(needed({ platform: "android", codecs: null })).toBe(true);
  });
});

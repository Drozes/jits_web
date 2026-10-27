/**
 * Dynamic capture bitrate (specs/dynamic-capture-bitrate, jits-n2im.33): the
 * bitrate (and on iOS the codec) a match recording is made with, chosen once
 * before it starts from the network at the face-off and this phone's recent
 * upload throughput.
 *
 * Pure: no React, no native module, no storage. The hook
 * (`use-capture-bitrate.ts`) gathers the inputs and freezes the decision
 * with the capture quality; this module only decides.
 *
 * The owner's rules (spec section 3): never below the platform floor for the
 * quality, never a change mid-recording (the hook's job), and an unmanaged
 * decision (no codec, no bitrate) is exactly today's behaviour, so every
 * input that is unknown or unusable falls back either to the weak level or
 * to today's recording, never to something lower.
 *
 * Values are bits per second, as both `videoBitrate` props take them.
 */
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";

/** Inverted kill switch (D9): a missing row or `false` keeps the feature on. */
export const CAPTURE_BITRATE_OFF_FLAG = "match_capture_bitrate_off";
/** History median at or above this (Mbps) is "normal" (D4). */
export const CAPTURE_NORMAL_MIN_MBPS = 8;
/** Newest first across every class and place (phase 2, E3; was 5). */
export const CAPTURE_HISTORY_MAX_SAMPLES = 20;
export const CAPTURE_HISTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** A sample stamped further ahead of `now` than this is a clock jump (picker and store alike). */
export const CAPTURE_HISTORY_FUTURE_TOLERANCE_MS = 60_000;
/** One bad upload alone never flips the level (D11). */
export const CAPTURE_HISTORY_MIN_SAMPLES = 2;
export const CAPTURE_SAMPLE_MIN_BYTES = 8 * 1024 * 1024;
export const CAPTURE_SAMPLE_MIN_ACTIVE_MS = 5_000;
export const CAPTURE_CODEC_QUERY_TIMEOUT_MS = 2_000;
export const CAPTURE_NETWORK_TIMEOUT_MS = 1_000;
/** The kill switch read; a slower answer keeps the last value read. */
export const CAPTURE_FLAG_TIMEOUT_MS = 1_500;
/** Inverted probe kill switch (phase 2, E9): a missing row or `false` allows the probe. */
export const CAPTURE_PROBE_OFF_FLAG = "match_capture_probe_off";
/** "Here" (E2): two cells at most this far apart (metres) are the same place. */
export const CAPTURE_LOCATION_MATCH_M = 1_600;
/** The stored cell grid (E1): about 1.1 km north-south. */
export const CAPTURE_LOCATION_GRID_DEG = 0.01;
/** The whole location read (E5); a slower OS answer falls to the device store. */
export const CAPTURE_LOCATION_TIMEOUT_MS = 1_000;
export const CAPTURE_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
/** Approximate fixes (Android about 2 km, iOS reduced accuracy) still place a 1 km cell well enough. */
export const CAPTURE_LOCATION_MAX_ACCURACY_M = 3_000;
/** A probe older than this is ignored by the picker (E10). */
export const CAPTURE_PROBE_MAX_AGE_MS = 10 * 60 * 1000;

export type CaptureLadder = "hevc" | "h264";
export type CaptureLevel = "normal" | "weak";
/** Bits per second. */
export interface CaptureLevelSet {
  normal: number;
  weak: number;
  floor: number;
}
export type CaptureBitrateLevels = Record<CaptureLadder, Record<MatchVideoCaptureQuality, CaptureLevelSet>>;

/** The owner-agreed table (spec section 3, D1, D2). */
export const CAPTURE_BITRATE_LEVELS: CaptureBitrateLevels = {
  hevc: {
    "720p": { normal: 3_000_000, weak: 2_500_000, floor: 2_000_000 },
    "1080p": { normal: 4_500_000, weak: 4_000_000, floor: 3_500_000 },
  },
  h264: {
    "720p": { normal: 4_000_000, weak: 3_000_000, floor: 3_000_000 },
    "1080p": { normal: 6_000_000, weak: 5_000_000, floor: 5_000_000 },
  },
};

export type CaptureNetworkClass = "wifi" | "ethernet" | "cellular" | "other" | "none" | "unknown";

/** What the hook reads from NetInfo once at the face-off. */
export interface CaptureNetworkSnapshot {
  /** NetInfo `state.type`. */
  type: string | null;
  /** `state.details.cellularGeneration` ("2g" | "3g" | "4g" | "5g" | null). */
  cellularGeneration: string | null;
  /** `state.isInternetReachable` (null = not yet known). */
  isInternetReachable: boolean | null;
}

/**
 * About 1 km grid cell (E1): lat and lng rounded to `CAPTURE_LOCATION_GRID_DEG`.
 * Device-only: never sent to the server, telemetry or logs (E14).
 */
export interface CaptureGeoCell {
  lat: number;
  lng: number;
}

/** One persisted throughput sample (`capture-bitrate-history.ts`). */
export interface ThroughputSample {
  /** Epoch ms the upload (or probe) landed. */
  ts: number;
  network: Exclude<CaptureNetworkClass, "none" | "unknown">;
  /** Informational only: cellular generations are pooled (D10). */
  cellularGeneration: string | null;
  /** > 0, finite. */
  mbps: number;
  /** The face-off's cell (null: a phase 1 sample, or no location). */
  cell: CaptureGeoCell | null;
  /** Phase 1 samples load as "upload". */
  source: "upload" | "probe";
}

/** A probe that produced a rate (failures are passed as null). */
export interface CaptureProbeInput {
  /** > 0, finite. */
  mbps: number;
  /** The class at the probe's start. */
  network: CaptureNetworkClass;
  /** Epoch ms the probe ended. */
  at: number;
}

/** What became of this face-off's network probe (phase 2, 16.4). */
export type CaptureProbeOutcome =
  /** `captureProbeNeeded()` was false (incl. location-matched history on wifi/ethernet/other). */
  | "not_needed"
  /** `match_capture_probe_off` (or the bitrate kill switch). */
  | "off"
  /** No match id. */
  | "practice"
  /** A match video upload was running at start. */
  | "busy"
  /** `net-probe` answered 404 in this process. */
  | "absent"
  /** Still running when the decision was held (Android) or frozen. */
  | "pending"
  /** Landed in time and decided the level. */
  | "applied"
  /** Landed, but older than `CAPTURE_PROBE_MAX_AGE_MS` when the decision was made. */
  | "stale"
  /** Landed, but on another network class than the face-off's (the network changed) or unusable. */
  | "ignored"
  /** No session, network error, non-200, or no valid window. */
  | "failed"
  /** Aborted: upload started, lock, unmount, prep released. */
  | "cancelled"
  /** Relaunch re-entry, nothing read. */
  | "reentry";

export type CaptureBitrateReason =
  | "disabled"
  | "ios_codec_unknown"
  | "ios_no_supported_codec"
  | "reentry"
  | "network_unknown"
  | "offline"
  | "no_internet"
  | "cellular_slow_gen"
  | "history_good"
  | "history_weak"
  | "no_history_wifi"
  | "no_history_ethernet"
  | "no_history_cellular"
  | "no_history_other"
  | "probe_normal"
  | "probe_weak"
  /** The hook's stand-in before its inputs land (D13); never returned by the picker. */
  | "pending"
  /** Set by the recorder after iOS rejected the codec (spec 7.4); never returned by the picker. */
  | "codec_rejected";

export interface CaptureBitrateInput {
  /** `Platform.OS`; anything but "ios" follows the Android rules. */
  platform: string;
  quality: MatchVideoCaptureQuality;
  /** The kill switch. */
  disabled: boolean;
  /** A relaunch re-entry into a live match (D6). */
  reentry: boolean;
  /** iOS: the recordable codecs, null = unknown. Ignored elsewhere. */
  codecs: readonly string[] | null;
  /** Null = NetInfo unavailable. */
  network: CaptureNetworkSnapshot | null;
  history: readonly ThroughputSample[];
  /** The face-off's coarse cell; null = unknown (E5). */
  location: CaptureGeoCell | null;
  /** A probe that produced a rate; null = none, failed or not landed. */
  probe: CaptureProbeInput | null;
  /** Epoch ms, for the history window. */
  now: number;
  /** Tests inject; defaults to `CAPTURE_BITRATE_LEVELS`. */
  levels?: CaptureBitrateLevels;
}

export interface CaptureBitrateDecision {
  /** False = today's behaviour: no codec, no bitrate. */
  managed: boolean;
  /** Null when not managed. */
  bitrateBps: number | null;
  /** iOS only; always null on Android and when not managed. */
  codec: "hvc1" | "avc1" | null;
  level: CaptureLevel | null;
  ladder: CaptureLadder | null;
  quality: MatchVideoCaptureQuality;
  reason: CaptureBitrateReason;
  /** The table value was below the floor and the floor was used. */
  clamped: boolean;
  network: CaptureNetworkClass;
  cellularGeneration: string | null;
  /** Median of the matching samples; null when no usable history. */
  historyMedianMbps: number | null;
  /** Matching samples considered (0 when none). */
  historySamples: number;
  /** `input.location !== null`. */
  locationKnown: boolean;
  /** The history step used location-matched samples (at least 2). */
  historyMatchedLocation: boolean;
  /** The probe's rate when it decided, else null. */
  probeMbps: number | null;
  /**
   * The picker: "applied" when the probe decided, "stale" / "ignored" for a
   * landed probe it rejected, else "not_needed"; the hook then fills in the
   * prep's state (pending, failed, ...) for the "not_needed" case.
   */
  probeOutcome: CaptureProbeOutcome;
  /**
   * DEVICE-ONLY: the face-off's cell, for the upload job's sample (E13).
   * Never persisted in `PersistedCaptureBitrate`, never in telemetry.
   */
  geoCell: CaptureGeoCell | null;
}

/** Today's recording: no codec and no bitrate. */
export function unmanagedDecision(
  quality: MatchVideoCaptureQuality,
  reason: CaptureBitrateReason,
): CaptureBitrateDecision {
  return {
    managed: false,
    bitrateBps: null,
    codec: null,
    level: null,
    ladder: null,
    quality,
    reason,
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
  };
}

/**
 * The coarse cell of a reading (E1), or null unless finite and in range.
 * Rounded to 2 decimals; -0 becomes 0.
 */
export function coarseGeoCell(lat: number, lng: number): CaptureGeoCell | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const round = (x: number) => Math.round(x * 100) / 100 || 0;
  return { lat: round(lat), lng: round(lng) };
}

const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance in metres. */
export function geoCellDistanceM(a: CaptureGeoCell, b: CaptureGeoCell): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Both known and at most `CAPTURE_LOCATION_MATCH_M` apart (E2). */
export function isSameArea(a: CaptureGeoCell | null, b: CaptureGeoCell | null): boolean {
  return a !== null && b !== null && geoCellDistanceM(a, b) <= CAPTURE_LOCATION_MATCH_M;
}

/** Reasons a probe can never change (already weak or unmanaged): no data is spent on them. */
const PROBE_FUTILE_REASONS: readonly CaptureBitrateReason[] = [
  "reentry",
  "network_unknown",
  "offline",
  "no_internet",
  "cellular_slow_gen",
];

/**
 * E6, the input-only part: true when a probe could change this face-off's
 * decision. Cellular always (owner decision 2); Wi-Fi, ethernet and other
 * only without location-matched history. The hook adds the non-pure
 * conditions (probe flag, match id, upload busy, absent, already probed).
 */
export function captureProbeNeeded(input: Omit<CaptureBitrateInput, "probe">): boolean {
  if (input.disabled || input.reentry) return false;
  const base = pickCaptureBitrate({ ...input, probe: null });
  if (!base.managed || PROBE_FUTILE_REASONS.includes(base.reason)) return false;
  if (base.network === "cellular") return true;
  return (
    (base.network === "wifi" || base.network === "ethernet" || base.network === "other") &&
    !base.historyMatchedLocation
  );
}

/** Coarse network class (D10); `none` and `unknown` never match history. */
export function captureNetworkClassOf(snapshot: CaptureNetworkSnapshot | null): CaptureNetworkClass {
  const type = snapshot?.type ?? null;
  if (type == null || type === "unknown") return "unknown";
  if (type === "wifi" || type === "ethernet" || type === "cellular" || type === "none") return type;
  return "other";
}

/** Median Mbps (an even count takes the mean of the middle two); null when empty. */
export function medianMbps(samples: readonly ThroughputSample[]): number | null {
  if (samples.length === 0) return null;
  const sorted = samples.map((s) => s.mbps).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

/**
 * The decision for one recording (spec 6.3). Steps run in order and the
 * first match wins; the level never goes below the floor.
 */
export function pickCaptureBitrate(input: CaptureBitrateInput): CaptureBitrateDecision {
  const cls = captureNetworkClassOf(input.network);
  const cellularGeneration = input.network?.cellularGeneration ?? null;
  const location = input.location ?? null;
  const unmanaged = (
    reason: CaptureBitrateReason,
    history?: { median: number | null; samples: number; matchedLocation: boolean },
  ): CaptureBitrateDecision => ({
    ...unmanagedDecision(input.quality, reason),
    network: cls,
    cellularGeneration,
    historyMedianMbps: history?.median ?? null,
    historySamples: history?.samples ?? 0,
    locationKnown: location !== null,
    historyMatchedLocation: history?.matchedLocation ?? false,
    geoCell: location,
  });

  // 1. The kill switch.
  if (input.disabled) return unmanaged("disabled");

  // 2. Ladder and codec. iOS applies a bitrate only with a codec, and an
  // unlisted codec rejects the recording, so only a listed one is used.
  let ladder: CaptureLadder;
  let codec: "hvc1" | "avc1" | null;
  if (input.platform === "ios") {
    if (input.codecs === null) return unmanaged("ios_codec_unknown");
    if (input.codecs.includes("hvc1")) {
      ladder = "hevc";
      codec = "hvc1";
    } else if (input.codecs.includes("avc1")) {
      ladder = "h264";
      codec = "avc1";
    } else {
      return unmanaged("ios_no_supported_codec");
    }
  } else {
    ladder = "h264";
    codec = null;
  }

  // 3 to 9. The level.
  let level: CaptureLevel;
  let reason: CaptureBitrateReason;
  let historyMedian: number | null = null;
  let historySamples = 0;
  let historyMatchedLocation = false;
  let probeMbps: number | null = null;
  let probeOutcome: CaptureProbeOutcome = "not_needed";
  if (input.reentry) {
    level = "weak";
    reason = "reentry";
  } else if (cls === "unknown") {
    level = "weak";
    reason = "network_unknown";
  } else if (cls === "none") {
    level = "weak";
    reason = "offline";
  } else if (input.network?.isInternetReachable === false) {
    level = "weak";
    reason = "no_internet";
  } else if (cls === "cellular" && (cellularGeneration === "2g" || cellularGeneration === "3g")) {
    level = "weak";
    reason = "cellular_slow_gen";
  } else {
    // 8 (history), computed first so a probe decision still reports it.
    const classMatching = input.history.filter(
      (s) =>
        s.network === cls &&
        input.now - s.ts <= CAPTURE_HISTORY_MAX_AGE_MS &&
        s.ts - input.now <= CAPTURE_HISTORY_FUTURE_TOLERANCE_MS &&
        Number.isFinite(s.mbps) &&
        s.mbps > 0,
    );
    // With a known place only samples from here count (E4): another gym's
    // uplink says nothing about this one. Unknown place: phase 1, every place.
    const matching = location !== null ? classMatching.filter((s) => isSameArea(s.cell ?? null, location)) : classMatching;
    historySamples = matching.length;
    const enoughHistory = matching.length >= CAPTURE_HISTORY_MIN_SAMPLES;
    if (enoughHistory) historyMedian = medianMbps(matching);
    historyMatchedLocation = location !== null && enoughHistory;
    const probe = input.probe ?? null;
    // Age against the decision's clock (the hook passes the current time).
    // No future check: the probe ends after the inputs were read, so a
    // probe stamped after `now` is simply fresh.
    const probeStale = probe !== null && input.now - probe.at > CAPTURE_PROBE_MAX_AGE_MS;
    const probeUsable = probe !== null && probe.network === cls && Number.isFinite(probe.mbps) && probe.mbps > 0;
    if (probe !== null) probeOutcome = probeStale ? "stale" : probeUsable ? "applied" : "ignored";
    if (
      // 7b. A probe that landed in time, on this class, overrides history (E10).
      probeUsable &&
      !probeStale
    ) {
      const good = probe.mbps >= CAPTURE_NORMAL_MIN_MBPS;
      level = good ? "normal" : "weak";
      reason = good ? "probe_normal" : "probe_weak";
      probeMbps = probe.mbps;
    } else if (enoughHistory) {
      const good = historyMedian != null && historyMedian >= CAPTURE_NORMAL_MIN_MBPS;
      level = good ? "normal" : "weak";
      reason = good ? "history_good" : "history_weak";
    } else if (cls === "wifi") {
      level = "normal";
      reason = "no_history_wifi";
    } else if (cls === "ethernet") {
      level = "normal";
      reason = "no_history_ethernet";
    } else if (cls === "cellular") {
      level = "weak";
      reason = "no_history_cellular";
    } else {
      level = "weak";
      reason = "no_history_other";
    }
  }

  // 10. The bitrate, never below the floor. A broken table (only possible
  // once the levels are server-provided) records as today.
  const set = (input.levels ?? CAPTURE_BITRATE_LEVELS)[ladder]?.[input.quality];
  const history = { median: historyMedian, samples: historySamples, matchedLocation: historyMatchedLocation };
  if (!set || !isPositiveInt(set.normal) || !isPositiveInt(set.weak) || !isPositiveInt(set.floor)) {
    return unmanaged(reason, history);
  }
  const raw = set[level];
  return {
    managed: true,
    bitrateBps: Math.max(raw, set.floor),
    codec,
    level,
    ladder,
    quality: input.quality,
    reason,
    clamped: raw < set.floor,
    network: cls,
    cellularGeneration,
    historyMedianMbps: historyMedian,
    historySamples,
    locationKnown: location !== null,
    historyMatchedLocation,
    probeMbps,
    probeOutcome,
    geoCell: location,
  };
}

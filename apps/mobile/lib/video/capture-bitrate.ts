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
export const CAPTURE_HISTORY_MAX_SAMPLES = 5;
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

/** One persisted upload throughput sample (`capture-bitrate-history.ts`). */
export interface ThroughputSample {
  /** Epoch ms the upload landed. */
  ts: number;
  network: Exclude<CaptureNetworkClass, "none" | "unknown">;
  /** Informational only: cellular generations are pooled (D10). */
  cellularGeneration: string | null;
  /** > 0, finite. */
  mbps: number;
}

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
  };
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
  const unmanaged = (reason: CaptureBitrateReason, history?: { median: number | null; samples: number }) => ({
    ...unmanagedDecision(input.quality, reason),
    network: cls,
    cellularGeneration,
    historyMedianMbps: history?.median ?? null,
    historySamples: history?.samples ?? 0,
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
    const matching = input.history.filter(
      (s) =>
        s.network === cls &&
        input.now - s.ts <= CAPTURE_HISTORY_MAX_AGE_MS &&
        s.ts - input.now <= CAPTURE_HISTORY_FUTURE_TOLERANCE_MS &&
        Number.isFinite(s.mbps) &&
        s.mbps > 0,
    );
    historySamples = matching.length;
    if (matching.length >= CAPTURE_HISTORY_MIN_SAMPLES) {
      historyMedian = medianMbps(matching);
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
  const history = { median: historyMedian, samples: historySamples };
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
  };
}

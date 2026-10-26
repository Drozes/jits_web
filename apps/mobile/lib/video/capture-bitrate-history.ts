import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CAPTURE_HISTORY_FUTURE_TOLERANCE_MS,
  CAPTURE_HISTORY_MAX_AGE_MS,
  CAPTURE_HISTORY_MAX_SAMPLES,
  CAPTURE_SAMPLE_MIN_ACTIVE_MS,
  CAPTURE_SAMPLE_MIN_BYTES,
  captureNetworkClassOf,
  type ThroughputSample,
} from "./capture-bitrate";

/**
 * This phone's recent match-upload throughputs (dynamic capture bitrate,
 * spec 7.2, D3, D12): the picker's history input.
 *
 * One AsyncStorage key holding the newest `CAPTURE_HISTORY_MAX_SAMPLES`
 * samples across every network class, each at most 14 days old. Nothing
 * here throws: a corrupt or unreadable store reads as no history (the
 * picker's per-class default), and a failed write only loses one sample.
 */

export const CAPTURE_HISTORY_KEY = "elo-capture-throughput::v1";

const SAMPLE_CLASSES: readonly ThroughputSample["network"][] = ["wifi", "ethernet", "cellular", "other"];

function isValidSample(value: unknown): value is ThroughputSample {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.ts === "number" &&
    Number.isFinite(s.ts) &&
    SAMPLE_CLASSES.includes(s.network as ThroughputSample["network"]) &&
    typeof s.mbps === "number" &&
    Number.isFinite(s.mbps) &&
    s.mbps > 0 &&
    (s.cellularGeneration === null || typeof s.cellularGeneration === "string")
  );
}

/** Valid, inside the window, newest first, capped. */
function prune(samples: readonly ThroughputSample[], now: number): ThroughputSample[] {
  return samples
    .filter((s) => now - s.ts <= CAPTURE_HISTORY_MAX_AGE_MS && s.ts - now <= CAPTURE_HISTORY_FUTURE_TOLERANCE_MS)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, CAPTURE_HISTORY_MAX_SAMPLES);
}

/** The stored history; never throws. A corrupt value is removed (self-heal). */
export async function loadThroughputHistory(now: number = Date.now()): Promise<ThroughputSample[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(CAPTURE_HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) {
    try {
      await AsyncStorage.removeItem(CAPTURE_HISTORY_KEY);
    } catch {
      /* the next write replaces it anyway */
    }
    return [];
  }
  return prune(parsed.filter(isValidSample), now);
}

/**
 * Serialised read-modify-write, as in `upload-persistence.ts`: two uploads
 * landing together must not each read the old list and drop the other's
 * sample.
 */
let chain: Promise<unknown> = Promise.resolve();

/** Append one sample; never throws. */
export function recordThroughputSample(sample: ThroughputSample): Promise<void> {
  const next = chain.then(async () => {
    try {
      if (!isValidSample(sample)) return;
      const now = Date.now();
      const current = await loadThroughputHistory(now);
      await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify(prune([sample, ...current], now)));
    } catch {
      /* one lost sample only shortens the history */
    }
  });
  chain = next;
  return next;
}

/** One upload run, as `trackUploaded` measures it. */
export interface ThroughputRunInfo {
  landedAt: number;
  bytesThisRun: number;
  durationMs: number;
  backgroundedMs: number;
  networkType: string | null;
  cellularGeneration: string | null;
}

/**
 * A sample from a run that landed, or null when it says nothing about the
 * link (D12): too few bytes, too little foreground time, or no network class.
 * Background time is excluded: the upload is foreground-only and would read
 * as a slow network.
 */
export function throughputSampleFromRun(info: ThroughputRunInfo): ThroughputSample | null {
  const activeMs = info.durationMs - info.backgroundedMs;
  if (!Number.isFinite(info.bytesThisRun) || info.bytesThisRun < CAPTURE_SAMPLE_MIN_BYTES) return null;
  if (!Number.isFinite(activeMs) || activeMs < CAPTURE_SAMPLE_MIN_ACTIVE_MS) return null;
  const network = captureNetworkClassOf({
    type: info.networkType,
    cellularGeneration: info.cellularGeneration,
    isInternetReachable: null,
  });
  if (network === "none" || network === "unknown") return null;
  const mbps = (info.bytesThisRun * 8) / (activeMs / 1000) / 1e6;
  if (!Number.isFinite(mbps) || mbps <= 0) return null;
  return { ts: info.landedAt, network, cellularGeneration: info.cellularGeneration, mbps };
}

/** Test-only reset. */
export function __resetCaptureHistoryForTests(): void {
  chain = Promise.resolve();
}

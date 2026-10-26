import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CAPTURE_HISTORY_FUTURE_TOLERANCE_MS,
  CAPTURE_HISTORY_MAX_AGE_MS,
  CAPTURE_HISTORY_MAX_SAMPLES,
  CAPTURE_SAMPLE_MIN_ACTIVE_MS,
  CAPTURE_SAMPLE_MIN_BYTES,
  captureNetworkClassOf,
  coarseGeoCell,
  type CaptureGeoCell,
  type ThroughputSample,
} from "./capture-bitrate";

/**
 * This phone's recent match-upload throughputs (dynamic capture bitrate,
 * spec 7.2, D3, D12): the picker's history input.
 *
 * One AsyncStorage key holding the newest `CAPTURE_HISTORY_MAX_SAMPLES`
 * samples across every network class and place, each at most 14 days old.
 * Phase 2 (spec 16, E1, E12, E14): a sample may carry the face-off's coarse
 * cell (about 1 km, device-only) and comes from an upload or a network
 * probe; phase 1 samples load with no cell as uploads. Because the cells
 * record where matches happened, the key is cleared at sign-out and account
 * deletion. Nothing here throws: a corrupt or unreadable store reads as no
 * history (the picker's per-class default), and a failed write only loses
 * one sample.
 */

export const CAPTURE_HISTORY_KEY = "elo-capture-throughput::v1";

const SAMPLE_CLASSES: readonly ThroughputSample["network"][] = ["wifi", "ethernet", "cellular", "other"];

/** A stored cell, re-rounded; anything malformed is null (the sample is kept). */
function storedCell(value: unknown): CaptureGeoCell | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  return typeof c.lat === "number" && typeof c.lng === "number" ? coarseGeoCell(c.lat, c.lng) : null;
}

/** A stored sample, normalised (cell and source repaired), or null when its core fields are invalid. */
function toSample(value: unknown): ThroughputSample | null {
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  const valid =
    typeof s.ts === "number" &&
    Number.isFinite(s.ts) &&
    SAMPLE_CLASSES.includes(s.network as ThroughputSample["network"]) &&
    typeof s.mbps === "number" &&
    Number.isFinite(s.mbps) &&
    s.mbps > 0 &&
    (s.cellularGeneration === null || typeof s.cellularGeneration === "string");
  if (!valid) return null;
  return {
    ts: s.ts as number,
    network: s.network as ThroughputSample["network"],
    cellularGeneration: s.cellularGeneration as string | null,
    mbps: s.mbps as number,
    cell: storedCell(s.cell),
    source: s.source === "probe" ? "probe" : "upload",
  };
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
  return prune(
    parsed.map(toSample).filter((x): x is ThroughputSample => x !== null),
    now,
  );
}

/**
 * Serialised read-modify-write, as in `upload-persistence.ts`: two uploads
 * landing together must not each read the old list and drop the other's
 * sample.
 */
let chain: Promise<unknown> = Promise.resolve();

/**
 * Bumped by every clear (sign-out, account deletion). A measurement started
 * under an older generation (an upload run or a probe from the previous
 * session) is never written into the next one.
 */
let generation = 0;

/** The current history generation; capture it when a measurement starts. */
export function throughputHistoryGeneration(): number {
  return generation;
}

/**
 * Append one sample; never throws. `measuredIn`: the generation the
 * measurement started in (default: now); a clear since then drops it.
 */
export function recordThroughputSample(sample: ThroughputSample, measuredIn: number = generation): Promise<void> {
  const next = chain.then(async () => {
    try {
      if (measuredIn !== generation) return;
      const valid = toSample(sample);
      if (!valid) return;
      const now = Date.now();
      const current = await loadThroughputHistory(now);
      await AsyncStorage.setItem(CAPTURE_HISTORY_KEY, JSON.stringify(prune([valid, ...current], now)));
    } catch {
      /* one lost sample only shortens the history */
    }
  });
  chain = next;
  return next;
}

/**
 * Remove the whole history (sign-out, account deletion: E14). Through the
 * same chain, so a write in flight cannot put it back. Never throws.
 */
export function clearThroughputHistory(): Promise<void> {
  generation += 1;
  const next = chain.then(async () => {
    try {
      await AsyncStorage.removeItem(CAPTURE_HISTORY_KEY);
    } catch {
      /* the next sign-in reads whatever is left; nothing else can */
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
  /** The face-off's cell, already checked against the run's class (E13); null otherwise. */
  cell?: CaptureGeoCell | null;
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
  return {
    ts: info.landedAt,
    network,
    cellularGeneration: info.cellularGeneration,
    mbps,
    cell: info.cell ?? null,
    source: "upload",
  };
}

/** Test-only reset. */
export function __resetCaptureHistoryForTests(): void {
  chain = Promise.resolve();
  generation = 0;
}

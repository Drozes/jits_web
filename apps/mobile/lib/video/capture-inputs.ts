/**
 * The face-off inputs of the capture bitrate picker (spec 7.1, 7.3, phase 2
 * 16.5): NetInfo once, the throughput history, the iOS codec list, both
 * kill switches and the coarse location, each bounded and failing on its
 * own to a safe value. Read by the per-match capture prep
 * (`capture-prep.ts`); re-exported by `use-capture-bitrate.ts`, where they
 * used to live.
 */
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFeatureFlag } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import {
  CAPTURE_BITRATE_OFF_FLAG,
  CAPTURE_FLAG_TIMEOUT_MS,
  CAPTURE_NETWORK_TIMEOUT_MS,
  CAPTURE_PROBE_OFF_FLAG,
  type CaptureGeoCell,
  type CaptureNetworkSnapshot,
  type ThroughputSample,
} from "./capture-bitrate";
import { loadThroughputHistory } from "./capture-bitrate-history";
import { ensureCaptureCodecs } from "./capture-codecs";
import { readCaptureLocation } from "./capture-location";

/** Where the last kill switch answer is kept across launches (D9). */
export const CAPTURE_BITRATE_OFF_KEY = "elo-capture-bitrate-off::v1";

/**
 * The kill switch as last read (D9). Persisted, so a relaunch re-entry into
 * a live match (which reads nothing, D6) still honours a switch an admin
 * flipped before the relaunch. Never read on this install (or not primed yet
 * when the re-entry renders): feature on, as a missing row reads, since the
 * weak level is itself the safe, fast choice.
 */
let lastKnownOff = false;
/** A network answer landed in this process; the disk value is older. */
let readThisProcess = false;

/** The kill switch as last read, synchronously (re-entry cannot wait for a read). */
export function lastKnownCaptureBitrateOff(): boolean {
  return lastKnownOff;
}

/** Load the persisted answer (no network). Called once at app start; never throws. */
export async function primeCaptureBitrateOff(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CAPTURE_BITRATE_OFF_KEY);
    const parsed = raw ? (JSON.parse(raw) as { off?: unknown } | null) : null;
    if (!readThisProcess && typeof parsed?.off === "boolean") lastKnownOff = parsed.off;
  } catch {
    /* default: feature on */
  }
}

/**
 * One read of `match_capture_bitrate_off`, bounded by `CAPTURE_FLAG_TIMEOUT_MS`
 * so a slow answer can never hold the face-off's decision back; a failed or
 * slow read keeps the last value. Never throws.
 */
export async function readCaptureBitrateOff(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_FLAG_TIMEOUT_MS);
    });
    const res = await Promise.race([getFeatureFlag(supabase, CAPTURE_BITRATE_OFF_FLAG), timeout]);
    if (res?.ok) {
      lastKnownOff = res.data;
      readThisProcess = true;
      AsyncStorage.setItem(CAPTURE_BITRATE_OFF_KEY, JSON.stringify({ off: res.data })).catch(() => undefined);
    }
  } catch {
    /* keep the last value read */
  } finally {
    if (timer) clearTimeout(timer);
  }
  return lastKnownOff;
}

/** NetInfo once, within `CAPTURE_NETWORK_TIMEOUT_MS`; null on a throw or the timeout. */
export async function readCaptureNetwork(): Promise<CaptureNetworkSnapshot | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_NETWORK_TIMEOUT_MS);
    });
    const state = await Promise.race([NetInfo.fetch(), timeout]);
    if (!state) return null;
    const details = state.details as { cellularGeneration?: unknown } | null | undefined;
    return {
      type: typeof state.type === "string" ? state.type : null,
      cellularGeneration: typeof details?.cellularGeneration === "string" ? details.cellularGeneration : null,
      isInternetReachable: typeof state.isInternetReachable === "boolean" ? state.isInternetReachable : null,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The probe kill switch as last read in this process (E9; not persisted: re-entry never probes). */
let lastKnownProbeOff = false;

/**
 * One read of `match_capture_probe_off` (inverted: a missing row or `false`
 * allows the probe), bounded like the bitrate switch; a failed or slow read
 * keeps the last value read in this process. Never throws.
 */
export async function readCaptureProbeOff(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_FLAG_TIMEOUT_MS);
    });
    const res = await Promise.race([getFeatureFlag(supabase, CAPTURE_PROBE_OFF_FLAG), timeout]);
    if (res?.ok) lastKnownProbeOff = res.data;
  } catch {
    /* keep the last value read */
  } finally {
    if (timer) clearTimeout(timer);
  }
  return lastKnownProbeOff;
}

/** One face-off's picker inputs (phase 2 16.5). */
export interface CaptureInputs {
  disabled: boolean;
  /** `match_capture_probe_off`. */
  probeOff: boolean;
  codecs: readonly string[] | null;
  network: CaptureNetworkSnapshot | null;
  history: readonly ThroughputSample[];
  /** The coarse cell (E5); null = unknown. Device-only. */
  location: CaptureGeoCell | null;
  /** When the inputs landed: the history window is measured from here. */
  now: number;
}

/** Every input in parallel, each to its safe value. Never rejects. */
export async function readCaptureInputs(): Promise<CaptureInputs> {
  const [network, history, codecs, disabled, probeOff, location] = await Promise.all([
    readCaptureNetwork().catch(() => null),
    loadThroughputHistory().catch((): ThroughputSample[] => []),
    ensureCaptureCodecs().catch(() => null),
    readCaptureBitrateOff().catch(() => lastKnownOff),
    readCaptureProbeOff().catch(() => lastKnownProbeOff),
    readCaptureLocation().catch(() => null),
  ]);
  return { network, history, codecs, disabled, probeOff, location, now: Date.now() };
}

/** Test-only reset of the module state. */
export function __resetCaptureInputsForTests(): void {
  lastKnownOff = false;
  readThisProcess = false;
  lastKnownProbeOff = false;
}

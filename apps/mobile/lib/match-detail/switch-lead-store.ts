import {
  INITIAL_LEAD_S,
  LEAD_MAX_S,
  LEAD_MIN_S,
  LEAD_SAFETY,
  START_LATENCY_INITIAL_S,
  type NetworkClass,
} from "./keep-watching";

/**
 * The adaptive lead of the keep-watching switch (jits-xfvd.19, contract 07
 * section 3.2): an in-memory store for one app run, keyed by network class.
 * Each landed keep-watching switch records how long the incoming angle took
 * from its replaceAsync to ready at its target, and from play() to its first
 * advancing time; both are EWMAs (alpha 0.3). Shared with the multi-angle
 * player's on-demand standby (jits-xfvd.3), so nothing here imports the
 * single player.
 *
 * It also holds the Android decoder latch (D7): after a decoder error of an
 * incoming angle, every later switch in this app run runs in place.
 */

const ALPHA = 0.3;

interface ClassStats {
  readyEwmaS: number | null;
  startLatencyEwmaS: number | null;
}

let stats: Record<NetworkClass, ClassStats> = fresh();
let unsupported = false;

function fresh(): Record<NetworkClass, ClassStats> {
  return {
    fast: { readyEwmaS: null, startLatencyEwmaS: null },
    cellular: { readyEwmaS: null, startLatencyEwmaS: null },
    slow: { readyEwmaS: null, startLatencyEwmaS: null },
  };
}

function ewma(prev: number | null, sample: number): number {
  return prev == null ? sample : ALPHA * sample + (1 - ALPHA) * prev;
}

/** The lead (wall seconds) for a switch on this network class. */
export function leadFor(cls: NetworkClass): number {
  const ready = stats[cls].readyEwmaS;
  if (ready == null) return INITIAL_LEAD_S[cls];
  return Math.min(LEAD_MAX_S, Math.max(LEAD_MIN_S, LEAD_SAFETY * ready + 0.2));
}

/** play() to the first advancing time update (seconds). */
export function startLatencyFor(cls: NetworkClass): number {
  return stats[cls].startLatencyEwmaS ?? START_LATENCY_INITIAL_S;
}

/** One landed keep-watching switch's timings (ms). */
export function recordSwitchTiming(cls: NetworkClass, sample: { readyMs: number; startLatencyMs: number | null }): void {
  const s = stats[cls];
  if (Number.isFinite(sample.readyMs) && sample.readyMs >= 0) s.readyEwmaS = ewma(s.readyEwmaS, sample.readyMs / 1000);
  if (sample.startLatencyMs != null && Number.isFinite(sample.startLatencyMs) && sample.startLatencyMs >= 0) {
    s.startLatencyEwmaS = ewma(s.startLatencyEwmaS, sample.startLatencyMs / 1000);
  }
}

/** D7: an incoming angle failed with an Android decoder error; later switches run in place. */
export function markKeepWatchingUnsupported(): void {
  unsupported = true;
}

export function keepWatchingUnsupported(): boolean {
  return unsupported;
}

export function __resetSwitchLeadStoreForTests(): void {
  stats = fresh();
  unsupported = false;
}

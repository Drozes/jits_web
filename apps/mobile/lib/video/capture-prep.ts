/**
 * The per-match "capture prep" (dynamic capture bitrate phase 2, spec 16.3
 * E6, E11, E12, 16.5): the face-off's picker inputs and its one background
 * network probe, keyed by the match id so they can start before the camera
 * surface exists (the timekeeper's request sheet starts it while the asked
 * person reads it; the athlete's viewfinder hook starts it on the weight
 * step) and be read synchronously on the first render that needs them.
 *
 * Invariants:
 * - Nothing here is ever waited on: the hook decides from whatever has
 *   landed (the base decision until the probe lands).
 * - At most one probe per match id per process, and one probe at a time
 *   process-wide (starting one cancels any other).
 * - Never while a match video upload is running: skipped (`busy`) when one
 *   is running at the start, aborted (`cancelled`) when one starts.
 * - Never during a recording: the hook stops the probe at the lock.
 * - Never across a background: iOS suspends JS, so a probe measured across
 *   it would read as a slow link (and be stored for 14 days); aborted.
 * - Every timer, XHR and subscription ends on stop, release or expiry.
 * - The coarse cell stays on the device: it goes only into the history
 *   sample, never into telemetry (the probe breadcrumb has no cell, match
 *   id or coordinate).
 */
import { AppState, Platform } from "react-native";
import * as tracking from "@/lib/error-tracking/sentry";
import {
  captureNetworkClassOf,
  captureProbeNeeded,
  type CaptureProbeInput,
  type CaptureProbeOutcome,
  type ThroughputSample,
} from "./capture-bitrate";
import { recordThroughputSample, throughputHistoryGeneration } from "./capture-bitrate-history";
import { readCaptureInputs, type CaptureInputs } from "./capture-inputs";
import { isNetProbeAbsent, runNetProbe, type NetProbeResult, type ProbeSignal } from "./net-probe";
import { hasActiveVideoUploads, subscribeUploadActivity } from "./video-upload-manager";

export type { CaptureInputs } from "./capture-inputs";

/** An entry no hook holds is dropped after this (the probe is long over by then). */
export const CAPTURE_PREP_MAX_AGE_MS = 5 * 60 * 1000;

export interface CapturePrepSnapshot {
  /** Null until the base reads land. */
  inputs: CaptureInputs | null;
  /** Set when a probe produced a rate. */
  probe: CaptureProbeInput | null;
  /** "pending" while running or before the base reads land. */
  probeOutcome: CaptureProbeOutcome;
}

export interface CapturePrepOptions {
  /** Null: practice (no probe). */
  matchId: string | null;
}

interface Entry {
  matchId: string | null;
  /** The history generation at the start: a sign-out since then drops the probe's sample. */
  historyGeneration: number;
  snapshot: CapturePrepSnapshot;
  stopped: boolean;
  /** Aborts the running probe; null when none runs. */
  abortProbe: (() => void) | null;
  expiry: ReturnType<typeof setTimeout> | null;
}

const SAMPLE_CLASSES: readonly string[] = ["wifi", "ethernet", "cellular", "other"];

const entries = new Map<string, Entry>();
/** Per key, independent of the entry's life, so a hook can subscribe before the prep starts. */
const listeners = new Map<string, Set<() => void>>();
/** "One probe per face-off" (E6): survives a release, a remount and a second start. */
const probedMatchIds = new Set<string>();
/** The one probe running process-wide. */
let runningKey: string | null = null;

function notify(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const cb of [...set]) {
    try {
      cb();
    } catch {
      /* a listener must not break the prep */
    }
  }
}

function update(key: string, entry: Entry, patch: Partial<CapturePrepSnapshot>): void {
  if (entries.get(key) !== entry) return;
  entry.snapshot = { ...entry.snapshot, ...patch };
  notify(key);
}

function createSignal(): { signal: ProbeSignal; abort: () => void } {
  let aborted = false;
  const cbs = new Set<() => void>();
  return {
    signal: {
      get aborted() {
        return aborted;
      },
      addEventListener: (_type, cb) => void cbs.add(cb),
      removeEventListener: (_type, cb) => void cbs.delete(cb),
    },
    abort: () => {
      if (aborted) return;
      aborted = true;
      for (const cb of [...cbs]) cb();
    },
  };
}

function probeCrumb(result: NetProbeResult): void {
  const fn = (tracking as Partial<typeof tracking>).addBreadcrumb;
  if (typeof fn !== "function") return;
  try {
    // Values only: never the cell, the match id or a coordinate (E14).
    fn({
      category: "video.capture",
      message: "net probe",
      level: "info",
      data: {
        status: result.status,
        mbps: result.mbps != null ? Math.round(result.mbps * 10) / 10 : null,
        method: result.method,
        bytesSent: result.bytesSent,
        elapsedMs: result.elapsedMs,
        httpStatus: result.httpStatus,
        serverMs: result.serverMs,
        network: result.network,
      },
    });
  } catch {
    /* telemetry is never allowed to fail the face-off */
  }
}

/** The E6 checks once the inputs landed: the outcome when no probe runs, or null to run one. */
function skipOutcome(entry: Entry, inputs: CaptureInputs): CaptureProbeOutcome | null {
  if (inputs.disabled || inputs.probeOff) return "off";
  if (entry.matchId === null) return "practice";
  const needed = captureProbeNeeded({
    platform: Platform.OS,
    // The quality does not change the answer; 720p only evaluates it.
    quality: "720p",
    disabled: inputs.disabled,
    reentry: false,
    codecs: inputs.codecs,
    network: inputs.network,
    history: inputs.history,
    location: inputs.location,
    now: inputs.now,
  });
  if (!needed || probedMatchIds.has(entry.matchId)) return "not_needed";
  if (isNetProbeAbsent()) return "absent";
  if (hasActiveVideoUploads()) return "busy";
  // Already in the background (the AppState listener only fires on a
  // change): iOS would suspend it mid-measurement. Not sent at all.
  if (AppState.currentState === "background") return "cancelled";
  return null;
}

function startProbe(key: string, entry: Entry, inputs: CaptureInputs, matchId: string): void {
  probedMatchIds.add(matchId);
  // One probe at a time process-wide: the newer face-off wins.
  if (runningKey !== null && runningKey !== key) entries.get(runningKey)?.abortProbe?.();
  runningKey = key;
  const { signal, abort } = createSignal();
  // An upload starting mid-probe takes the link: abort (`cancelled`).
  const unsubscribeUploads = subscribeUploadActivity(() => {
    if (hasActiveVideoUploads()) abort();
  });
  // Backgrounded mid-probe: abort (`cancelled`); the measurement is void.
  let appStateSub: { remove?: () => void } | null = null;
  try {
    appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "background") abort();
    }) as { remove?: () => void } | null;
  } catch {
    appStateSub = null;
  }
  const unsubscribe = () => {
    unsubscribeUploads();
    appStateSub?.remove?.();
  };
  entry.abortProbe = abort;
  const network = captureNetworkClassOf(inputs.network);
  void runNetProbe({ network, signal }).then((result) => {
    unsubscribe();
    if (entry.abortProbe === abort) entry.abortProbe = null;
    if (runningKey === key) runningKey = null;
    probeCrumb(result);
    if (result.status === "ok" && result.mbps != null) {
      // Stored whether or not it is applied (E12): the next match here benefits.
      if (SAMPLE_CLASSES.includes(network)) {
        void recordThroughputSample({
          ts: result.endedAt,
          network: network as ThroughputSample["network"],
          cellularGeneration: inputs.network?.cellularGeneration ?? null,
          mbps: result.mbps,
          cell: inputs.location,
          source: "probe",
        }, entry.historyGeneration).catch(() => undefined);
      }
      // Still "pending": the hook decides whether it was applied.
      update(key, entry, { probe: { mbps: result.mbps, network, at: result.endedAt } });
    } else {
      update(key, entry, { probeOutcome: result.status === "ok" ? "failed" : result.status });
    }
  });
}

/** Idempotent per key: a live entry for this key is kept as it is, else one starts. */
export function startCapturePrep(key: string, opts: CapturePrepOptions): void {
  if (entries.has(key)) return;
  const entry: Entry = {
    matchId: opts.matchId,
    historyGeneration: throughputHistoryGeneration(),
    snapshot: { inputs: null, probe: null, probeOutcome: "pending" },
    stopped: false,
    abortProbe: null,
    expiry: null,
  };
  entries.set(key, entry);
  entry.expiry = setTimeout(() => {
    entry.expiry = null;
    // Held by a hook: its unmount releases it.
    if (entries.get(key) === entry && !(listeners.get(key)?.size ?? 0)) releaseCapturePrep(key);
  }, CAPTURE_PREP_MAX_AGE_MS);
  notify(key);
  void readCaptureInputs().then((inputs) => {
    if (entries.get(key) !== entry) return;
    const skip = entry.stopped ? "cancelled" : skipOutcome(entry, inputs);
    update(key, entry, { inputs, ...(skip ? { probeOutcome: skip } : {}) });
    if (!skip && entry.matchId !== null && entries.get(key) === entry && !entry.stopped) {
      startProbe(key, entry, inputs, entry.matchId);
    }
  });
}

/** The live entry's snapshot, synchronously; null when there is none. Stable between changes. */
export function getCapturePrepSnapshot(key: string): CapturePrepSnapshot | null {
  return entries.get(key)?.snapshot ?? null;
}

export function subscribeCapturePrep(key: string, cb: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) listeners.delete(key);
  };
}

/** Abort the probe (lock, upload started) and never start one; the entry and its snapshot stay. */
export function stopCapturePrepProbe(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entry.stopped = true;
  entry.abortProbe?.();
}

/** Abort the probe and drop the entry (unmount, decline, lapse, expiry). */
export function releaseCapturePrep(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  entry.stopped = true;
  if (entry.expiry) clearTimeout(entry.expiry);
  entry.expiry = null;
  entry.abortProbe?.();
  if (runningKey === key) runningKey = null;
  notify(key);
}

/** Every entry (sign-out, account deletion: E14). */
export function releaseAllCapturePreps(): void {
  for (const key of [...entries.keys()]) releaseCapturePrep(key);
}

/** Test-only reset. */
export function __resetCapturePrepForTests(): void {
  releaseAllCapturePreps();
  listeners.clear();
  probedMatchIds.clear();
  runningKey = null;
}

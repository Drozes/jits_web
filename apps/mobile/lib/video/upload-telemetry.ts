import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as tracking from "@/lib/error-tracking/sentry";
import { httpClassOf, type UploadErrorClass } from "./upload-errors";
import { captureNetworkClassOf, type CaptureBitrateDecision, type CaptureGeoCell } from "./capture-bitrate";
import { recordThroughputSample, throughputHistoryGeneration, throughputSampleFromRun } from "./capture-bitrate-history";
import type { PersistedCaptureBitrate } from "./upload-persistence";

/**
 * Match-video upload telemetry (jits-n2im.7).
 *
 * Before this, a failed attempt only reached `console.warn`, and Sentry
 * heard about an upload only when it was abandoned or the runner crashed,
 * so nobody could say how long uploads take, how often they park, or how
 * often the phone was backgrounded mid-upload (the numbers the background
 * upload spike, jits-n2im.8, and the backend grace window need).
 *
 *   breadcrumbs  one per step: start, attempt failure, park, resume, retry.
 *                Free until an event is sent, then they ride along.
 *   events       exactly ONE per terminal outcome of a run: uploaded
 *                (duration, bytes, throughput, network type, attempts,
 *                backgrounded count and time), failed (needs the athlete),
 *                and the first daily-limit rejection of a job in this
 *                process. Abandon keeps its existing `captureException` in
 *                the manager, which is that outcome's one event.
 *
 * There is no analytics sink in the app, so the funnel numbers ride on the
 * Sentry events' `extra` (the bead's "if none, Sentry" fallback).
 *
 * The raw error text lives HERE (and in the device log), never in the UI:
 * the banner shows the friendly copy from `upload-errors.ts`.
 *
 * Every Sentry call is made through `call()`, which tolerates a doubled
 * tracking module that only provides `captureException` (most component
 * tests mock it that way): telemetry must never be the thing that breaks
 * an upload.
 */

const CATEGORY = "video.upload";

interface RunStats {
  /** Wall clock this run started (this process). */
  startedAt: number;
  /** Server-confirmed offset when the run started, for this run's throughput. */
  startOffset: number;
  attempts: number;
  backgroundedCount: number;
  backgroundedMs: number;
  backgroundedAt: number | null;
  /** The throughput history generation at the run's start (a sign-out since drops its sample). */
  historyGeneration: number;
}

const runs = new Map<string, RunStats>();
/**
 * Matches whose daily-limit rejection was already reported in this process
 * (m4). Module-level, not per run: every foreground or reconnect resume of
 * a limited job starts a new run, and each used to report again.
 */
const limitReported = new Set<string>();

/** Longest raw cause kept in telemetry. */
export const RAW_MAX_CHARS = 300;

/**
 * Raw causes go to telemetry only, and even there without the parts that
 * identify a transfer (m5): tus `DetailedError` text embeds the resumable
 * upload URL and the server's response text. URLs become `<url>`, response
 * bodies are cut, and the rest is bounded.
 */
export function scrubRaw(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  return raw
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/response text:[\s\S]*$/i, "response text: <omitted>")
    .slice(0, RAW_MAX_CHARS);
}
let appStateBound = false;
let appStateSub: { remove?: () => void } | null = null;

type TrackingModule = typeof tracking;

function call<K extends "addBreadcrumb" | "captureMessage">(
  name: K,
  ...args: Parameters<TrackingModule[K]>
): void {
  const fn = (tracking as Partial<TrackingModule>)[name] as ((...a: unknown[]) => void) | undefined;
  if (typeof fn !== "function") return;
  try {
    fn(...args);
  } catch {
    /* telemetry is never allowed to fail an upload */
  }
}

function bindAppState(): void {
  if (appStateBound) return;
  appStateBound = true;
  appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    const now = Date.now();
    for (const stats of runs.values()) {
      if (next === "background" && stats.backgroundedAt == null) {
        stats.backgroundedCount += 1;
        stats.backgroundedAt = now;
      } else if (next === "active" && stats.backgroundedAt != null) {
        stats.backgroundedMs += now - stats.backgroundedAt;
        stats.backgroundedAt = null;
      }
    }
  }) as { remove?: () => void } | null;
}

function crumb(message: string, data: Record<string, unknown>, level: "info" | "warning" = "info"): void {
  call("addBreadcrumb", { category: CATEGORY, message, level, data });
}

export interface RunInfo {
  matchId: string;
  phase: "bytes" | "row";
  bytesUploaded: number;
  fileSizeBytes: number;
  /** A run for a job that already existed (resume / retry), not a fresh recording. */
  resumed: boolean;
  trigger: "start" | "resume" | "retry";
}

/** A runner started (fresh recording, automatic resume, or manual retry). */
export function trackRunStart(info: RunInfo): void {
  bindAppState();
  runs.set(info.matchId, {
    startedAt: Date.now(),
    startOffset: info.phase === "row" ? info.fileSizeBytes : info.bytesUploaded,
    attempts: 0,
    backgroundedCount: 0,
    backgroundedMs: 0,
    backgroundedAt: AppState.currentState === "background" ? Date.now() : null,
    historyGeneration: throughputHistoryGeneration(),
  });
  crumb(`upload ${info.trigger}`, {
    matchId: info.matchId,
    phase: info.phase,
    offset: info.bytesUploaded,
    bytes: info.fileSizeBytes,
    resumed: info.resumed,
  });
}

/** One failed attempt (bytes or row), with its raw cause. */
export function trackAttemptFailed(info: {
  matchId: string;
  /** "reserve": the match_videos reservation before any byte (jits-n2im.11). */
  phase: "reserve" | "bytes" | "row";
  attempt: number;
  offset: number;
  status: number | null;
  klass: UploadErrorClass;
  raw: string;
}): void {
  const stats = runs.get(info.matchId);
  if (stats) stats.attempts += 1;
  crumb(
    `upload attempt ${info.attempt} failed`,
    {
      matchId: info.matchId,
      phase: info.phase,
      attempt: info.attempt,
      offset: info.offset,
      status: info.status,
      httpClass: httpClassOf(info.status),
      class: info.klass,
      raw: scrubRaw(info.raw),
    },
    "warning",
  );
}

function finish(matchId: string): (RunStats & { durationMs: number }) | null {
  const stats = runs.get(matchId);
  if (!stats) return null;
  runs.delete(matchId);
  const now = Date.now();
  if (stats.backgroundedAt != null) stats.backgroundedMs += now - stats.backgroundedAt;
  return { ...stats, durationMs: now - stats.startedAt };
}

/**
 * The run stopped without landing. A "paused" park is a breadcrumb (the
 * job retries itself); a "failed" one is the run's single event.
 */
export function trackParked(info: {
  matchId: string;
  disposition: "paused" | "failed";
  klass: UploadErrorClass;
  status: number | null;
  phase: "reserve" | "bytes" | "row";
  raw: string | null;
}): void {
  const data = {
    matchId: info.matchId,
    reason: info.klass,
    httpClass: httpClassOf(info.status),
    status: info.status,
    phase: info.phase,
    raw: scrubRaw(info.raw),
  };
  crumb(`upload ${info.disposition}`, data, "warning");

  if (info.klass === "limit" && !limitReported.has(info.matchId)) {
    limitReported.add(info.matchId);
    call("captureMessage", "Match video upload hit the daily limit", {
      level: "warning",
      tags: { "video.upload.outcome": "limit" },
      extra: data,
    });
  }
  const done = finish(info.matchId);
  if (info.disposition === "failed") {
    call("captureMessage", "Match video upload failed", {
      level: "warning",
      tags: { "video.upload.outcome": "failed", "video.upload.reason": info.klass },
      extra: { ...data, attempts: done?.attempts ?? null, durationMs: done?.durationMs ?? null },
    });
  }
}

/**
 * The recording started with this bitrate decision (dynamic capture bitrate,
 * spec 7.4): one breadcrumb, so a later event shows what the clip was made with.
 */
export function trackCaptureBitrate(decision: CaptureBitrateDecision): void {
  call("addBreadcrumb", {
    category: "video.capture",
    message: "capture bitrate",
    level: "info",
    data: {
      bitrateBps: decision.bitrateBps,
      codec: decision.codec,
      level: decision.level,
      ladder: decision.ladder,
      reason: decision.reason,
      network: decision.network,
      historyMedianMbps: decision.historyMedianMbps,
      // Phase 2 (16.10): booleans and the probe's outcome only, never the cell.
      locationKnown: decision.locationKnown ?? null,
      historyMatchedLocation: decision.historyMatchedLocation ?? null,
      probeOutcome: decision.probeOutcome ?? null,
      probeMbps: roundTenth(decision.probeMbps),
    },
  });
}

function roundTenth(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/** The capture fields on the uploaded event (spec section 10); all null when absent. */
function captureExtra(c: PersistedCaptureBitrate | null | undefined) {
  return {
    captureBitrateBps: c?.bitrateBps ?? null,
    captureCodec: c?.codec ?? null,
    captureLevel: c?.level ?? null,
    captureLadder: c?.ladder ?? null,
    captureReason: c?.reason ?? null,
    captureNetwork: c?.network ?? null,
    captureHistoryMedianMbps: c?.historyMedianMbps ?? null,
    captureLocationKnown: c?.locationKnown ?? null,
    captureHistoryMatchedLocation: c?.historyMatchedLocation ?? null,
    captureProbeOutcome: c?.probeOutcome ?? null,
    captureProbeMbps: roundTenth(c?.probeMbps),
  };
}

/**
 * The run landed: bytes and row. The run's single event. It also feeds this
 * phone's throughput history, the capture bitrate picker's input (D3, D12).
 */
export async function trackUploaded(info: {
  matchId: string;
  fileSizeBytes: number;
  createdAt: number;
  /** The decision the clip was recorded with (dynamic capture bitrate). */
  captureBitrate?: PersistedCaptureBitrate | null;
  /** The face-off's coarse cell (E13): only for the throughput sample, never in the event. */
  captureGeoCell?: CaptureGeoCell | null;
}): Promise<void> {
  const done = finish(info.matchId);
  let networkType: string | null = null;
  let cellularGeneration: string | null = null;
  try {
    const state = await NetInfo.fetch();
    networkType = state.type ?? null;
    const generation = (state.details as { cellularGeneration?: unknown } | null | undefined)?.cellularGeneration;
    cellularGeneration = typeof generation === "string" ? generation : null;
  } catch {
    networkType = null;
  }
  const sent = done ? Math.max(0, info.fileSizeBytes - done.startOffset) : null;
  const seconds = done ? done.durationMs / 1000 : null;
  const capture = info.captureBitrate ?? null;
  call("captureMessage", "Match video uploaded", {
    level: "info",
    tags: {
      "video.upload.outcome": "uploaded",
      "video.upload.network": networkType ?? "unknown",
      "video.capture.level": capture ? (capture.level ?? "unmanaged") : "unknown",
      "video.capture.probe": capture?.probeOutcome ?? "unknown",
    },
    extra: {
      matchId: info.matchId,
      bytes: info.fileSizeBytes,
      bytesThisRun: sent,
      durationMs: done?.durationMs ?? null,
      throughputBytesPerSec: sent != null && seconds && seconds > 0 ? Math.round(sent / seconds) : null,
      failedAttempts: done?.attempts ?? null,
      backgroundedCount: done?.backgroundedCount ?? null,
      backgroundedMs: done?.backgroundedMs ?? null,
      // From the job's creation (right after the recording stopped) to now:
      // the end-to-end lag the backend grace window has to cover.
      sinceRecordingEndMs: Date.now() - info.createdAt,
      networkType,
      ...captureExtra(capture),
    },
  });
  try {
    // Only a run with no failed attempt is a sample: the run's duration
    // also holds the failed attempts and the backoff sleeps between them,
    // which would read as a slow link (the manager does not time them
    // separately). Time in the background is excluded by the sample itself.
    // The face-off's cell only when the upload ran on the class the clip was
    // decided on (E13): an upload finished elsewhere says nothing about the gym.
    const sameClass =
      capture != null &&
      capture.network === captureNetworkClassOf({ type: networkType, cellularGeneration, isInternetReachable: null });
    const sample =
      done && sent != null && done.attempts === 0
        ? throughputSampleFromRun({
            landedAt: Date.now(),
            bytesThisRun: sent,
            durationMs: done.durationMs,
            backgroundedMs: done.backgroundedMs,
            networkType,
            cellularGeneration,
            cell: sameClass ? (info.captureGeoCell ?? null) : null,
          })
        : null;
    // Fire and forget: the event above has already gone.
    if (sample && done) recordThroughputSample(sample, done.historyGeneration).catch(() => undefined);
  } catch {
    /* telemetry is never allowed to fail an upload */
  }
}

/** A run that was superseded, stopped by sign-out, or abandoned: forget it quietly. */
export function trackRunDropped(matchId: string, why: string): void {
  if (!runs.has(matchId)) return;
  runs.delete(matchId);
  crumb(`upload run dropped (${why})`, { matchId });
}

/** Test-only reset. */
export function __resetUploadTelemetry(): void {
  runs.clear();
  limitReported.clear();
  appStateSub?.remove?.();
  appStateSub = null;
  appStateBound = false;
}

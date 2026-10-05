import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as tracking from "@/lib/error-tracking/sentry";
import { httpClassOf, type UploadErrorClass } from "./upload-errors";

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
  limitReported: boolean;
}

const runs = new Map<string, RunStats>();
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
    limitReported: false,
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
  phase: "bytes" | "row";
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
      raw: info.raw,
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
  phase: "bytes" | "row";
  raw: string | null;
}): void {
  const stats = runs.get(info.matchId);
  const data = {
    matchId: info.matchId,
    reason: info.klass,
    httpClass: httpClassOf(info.status),
    status: info.status,
    phase: info.phase,
    raw: info.raw,
  };
  crumb(`upload ${info.disposition}`, data, "warning");

  if (info.klass === "limit" && stats && !stats.limitReported) {
    stats.limitReported = true;
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

/** The run landed: bytes and row. The run's single event. */
export async function trackUploaded(info: {
  matchId: string;
  fileSizeBytes: number;
  createdAt: number;
}): Promise<void> {
  const done = finish(info.matchId);
  let networkType: string | null = null;
  try {
    networkType = (await NetInfo.fetch()).type ?? null;
  } catch {
    networkType = null;
  }
  const sent = done ? Math.max(0, info.fileSizeBytes - done.startOffset) : null;
  const seconds = done ? done.durationMs / 1000 : null;
  call("captureMessage", "Match video uploaded", {
    level: "info",
    tags: { "video.upload.outcome": "uploaded", "video.upload.network": networkType ?? "unknown" },
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
    },
  });
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
  appStateSub?.remove?.();
  appStateSub = null;
  appStateBound = false;
}

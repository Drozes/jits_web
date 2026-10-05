import { classifyUploadError } from "@jits/shared/utils";
import { UPLOAD_JOB_RETENTION_DAYS } from "./upload-persistence";

/**
 * Friendly, classified copy for a failed match-video upload attempt
 * (jits-n2im.5).
 *
 * WHY. Raw transport and Postgrest text used to reach the banner verbatim
 * ("Upload paused: Network request failed. It will resume automatically.",
 * "Video uploaded, but saving the record failed: new row violates
 * row-level security policy"). The raw text is still worth having, but in
 * telemetry (`upload-telemetry.ts`) and the device log, never on screen.
 *
 * Every failure falls into one small class, and the class decides two
 * things the UI needs:
 *
 *   disposition  "paused": the manager keeps retrying on its own (backoff,
 *                foreground, reconnect, the foreground retry timer).
 *                "failed": nothing will happen until the athlete acts.
 *   terminal     a failed upload that a retry can never fix (the file is
 *                gone, too big, the server's re-slice ceiling). The UI
 *                offers Discard instead of Retry.
 *
 * Copy never promises the clip is kept forever: a persisted job is
 * abandoned after UPLOAD_JOB_RETENTION_DAYS (upload-persistence.ts), and the
 * earlier "The recording is saved on this device" was broken by exactly
 * that cleanup (jits-w2h7 item 5).
 *
 * TODO(jr_be-1qz.2): the preflight half of jits-n2im.5 (call
 * `can_upload_match_video` when the athlete turns "Record from my phone" on
 * at face-off, and again before the upload, showing remaining_today /
 * resets_at up front) waits for that backend RPC. Until it ships, the gate
 * classes below are only learned AFTER the bytes are up, from the
 * `match_videos` insert.
 */
export type UploadErrorClass =
  /** No HTTP status: DNS, TLS, socket reset, airplane mode. */
  | "offline"
  /** 5xx, 408, 423, 429, a stalled or aborted attempt. */
  | "server"
  /** 401 or no session: every attempt re-reads the token, so it heals. */
  | "auth"
  /** 403 and other 4xx: the server refused this upload. */
  | "not_allowed"
  /** 413 or over the 2 GB client cap. */
  | "too_large"
  /** HINT upload_rate_limited: the rolling 24 h per-athlete cap. */
  | "limit"
  /** HINT video_upload_disabled: uploads switched off server side. */
  | "disabled"
  /** HINT upload_not_in_cohort: this athlete is not allowlisted. */
  | "not_in_cohort"
  /** HINT video_reslice_limit: this video was replaced too many times. */
  | "reslice_limit"
  /** The local clip is gone; there is nothing left to send. */
  | "file_missing"
  /** Bytes are in the bucket, the match_videos write keeps failing. */
  | "save_failed"
  | "unknown";

export type UploadDisposition = "paused" | "failed";

export interface UploadFailureCopy {
  klass: UploadErrorClass;
  disposition: UploadDisposition;
  /** A retry can never succeed: offer Discard, not Retry. */
  terminal: boolean;
  /** What the banner says. Never contains server or transport text. */
  message: string;
}

const RETENTION = `${UPLOAD_JOB_RETENTION_DAYS} days`;

const COPY: Record<UploadErrorClass, Omit<UploadFailureCopy, "klass">> = {
  offline: {
    disposition: "paused",
    terminal: false,
    message: "Upload paused: no connection. It picks up again when you're back online.",
  },
  server: {
    disposition: "paused",
    terminal: false,
    message: "Upload paused: the server is busy. It will retry automatically.",
  },
  auth: {
    disposition: "paused",
    terminal: false,
    message: "Upload paused while your sign-in refreshes. It will retry automatically.",
  },
  not_allowed: {
    disposition: "failed",
    terminal: false,
    message: `Upload failed: the server didn't accept this video. Tap Retry to try again. The recording stays on this phone for ${RETENTION}.`,
  },
  too_large: {
    disposition: "failed",
    terminal: true,
    message: "This video is too large to upload (2 GB max).",
  },
  limit: {
    disposition: "paused",
    terminal: false,
    message: `Daily video limit reached. It uploads once your limit resets, as long as you open the app within ${RETENTION}.`,
  },
  disabled: {
    disposition: "failed",
    terminal: false,
    message: `Video uploads are turned off right now. Tap Retry later. The recording stays on this phone for ${RETENTION}.`,
  },
  not_in_cohort: {
    disposition: "failed",
    terminal: false,
    message: `Video uploads aren't turned on for your account yet. The recording stays on this phone for ${RETENTION}.`,
  },
  reslice_limit: {
    disposition: "failed",
    terminal: true,
    message: "This match's video was already replaced the maximum number of times, so this recording can't be uploaded.",
  },
  file_missing: {
    disposition: "failed",
    terminal: true,
    message: "The recording is no longer on this phone, so it can't be uploaded.",
  },
  save_failed: {
    disposition: "paused",
    terminal: false,
    message: "Video uploaded, but it isn't attached to the match yet. It will retry automatically.",
  },
  unknown: {
    disposition: "paused",
    terminal: false,
    message: "Upload paused. It will retry automatically.",
  },
};

export function describeUploadFailure(klass: UploadErrorClass): UploadFailureCopy {
  return { klass, ...COPY[klass] };
}

/** True when a retry can never succeed for this class. */
export function isTerminalUploadClass(klass: UploadErrorClass | null | undefined): boolean {
  return klass != null && COPY[klass].terminal;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

/**
 * Classify a failed BYTE attempt (tus). Reuses the shared retry classifier
 * for the HTTP status so the two can never disagree about what a status
 * means, and adds the client-side throws `uploadFileResumable` makes before
 * any request ("Not signed in", the 2 GB cap).
 */
export function classifyByteFailure(err: unknown): UploadErrorClass {
  const { status } = classifyUploadError(err);
  const message = messageOf(err);
  if (status == null) {
    if (/not signed in/i.test(message)) return "auth";
    if (/under 2 GB/i.test(message)) return "too_large";
    // The stall watchdog and a supersede both abort; the server keeps the
    // offset, so it is the server-side "try again" family, not offline.
    if (/aborted/i.test(message)) return "server";
    return "offline";
  }
  if (status === 401) return "auth";
  if (status === 413) return "too_large";
  if (status === 404 || status === 410 || status === 409) return "server";
  if (status === 408 || status === 423 || status === 429) return "server";
  if (status >= 400 && status < 500) return "not_allowed";
  return "server";
}

/** A server-side upload gate's class, from `MatchVideoDbError.gate`. */
const GATE_CLASS: Record<string, UploadErrorClass> = {
  rate_limited: "limit",
  disabled: "disabled",
  not_in_cohort: "not_in_cohort",
  reslice_limit: "reslice_limit",
};

/** Classify a failed `match_videos` write (the row phase). */
export function classifyRowFailure(err: unknown): UploadErrorClass {
  const gate = (err as { gate?: unknown } | null)?.gate;
  if (typeof gate === "string" && GATE_CLASS[gate]) return GATE_CLASS[gate];
  if (/not signed in|jwt/i.test(messageOf(err))) return "auth";
  return "save_failed";
}

/**
 * Coarse HTTP family for telemetry grouping: "none" for a transport
 * failure, else "4xx" / "5xx". The exact status rides along separately.
 */
export function httpClassOf(status: number | null): "none" | "4xx" | "5xx" | "other" {
  if (status == null) return "none";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  return "other";
}

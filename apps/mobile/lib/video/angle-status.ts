import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { uploadPercent } from "@jits/shared/utils";
import type { MatchUploadEntry } from "./match-upload-store";
import { isTerminalUploadClass } from "./upload-errors";

/**
 * One angle row's status, from the server row (`get_match_details`), for the
 * match detail FILM rows and the verdict (jits-n2im.12). Strings are COPY-DECK
 * v2.2 section 2 (2b for the viewer's own angle seen without its local job,
 * 2c for another athlete's angle), kept minimal on purpose: the full Film
 * status model (phases, wait windows, "Not used") is jits-n2im.25 and waits
 * on jr_be-1qz.20.
 *
 * Tags are sentence case; the rows render them in mono caps.
 *
 *   tone  progress  uploading (ink-2)
 *         waiting   paused, processing, analyzing (attention / amber)
 *         done      ready to watch, breakdown ready (ink)
 *         info      didn't upload (ink-3, nothing to do)
 *         negative  the shipped pipeline-failure row (unchanged)
 */
export type AngleTone = "progress" | "waiting" | "done" | "info" | "negative";

export interface AngleStatus {
  tag: string;
  tone: AngleTone;
  /** Right-hand value: `{pct}%` while uploading, else null (the row shows the duration). */
  right: string | null;
  /** 0..100 while uploading with a known total, for accessibilityValue. */
  percent: number | null;
  helper: string | null;
}

/** Deck tags (section 2). */
export const ANGLE_TAG = {
  uploading: "Uploading",
  paused: "Paused",
  processing: "Processing",
  analyzing: "Analyzing",
  ready: "Ready to watch",
  breakdown: "Breakdown ready",
  didntUpload: "Didn't upload",
  notUsed: "Not used",
  analysisFailed: "Analysis failed · may still play",
} as const;

const PIPELINE = new Set(["processing", "slicing", "analyzing", "merging"]);

/** THIS phone's job for the viewer's own angle (deck 2a: it wins over the server). */
export interface LocalAngleJob {
  /** The match-upload store status. */
  status: "pending" | "uploading" | "paused" | "error";
  /** 0..1, when known. */
  progress: number | null;
  /** A failure a retry cannot fix (grey, nothing to do). */
  terminal: boolean;
  /** The store's friendly cause (deck section 8) for a paused or failed job. */
  message?: string | null;
  /** A terminal failure with the clip still on this phone: Discard is offered (deck 12). */
  discardable?: boolean;
}

export interface AngleStatusContext {
  /** The uploader's short name (`M. Park`), for the helpers about their phone. */
  name: string;
  /** This phone's job for the viewer's own angle, when one exists. */
  local?: LocalAngleJob | null;
}

function pct(progress: number | null | undefined): number | null {
  return progress != null && Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : null;
}

/**
 * The viewer's own angle while this phone's job is still running or parked.
 * The upload card above carries the cause and the actions, so the row only
 * names the state; it never says "Uploading" over a paused or failed job.
 */
function localStatus(job: LocalAngleJob): AngleStatus {
  if (job.status === "paused") {
    return { tag: ANGLE_TAG.paused, tone: "waiting", right: null, percent: null, helper: null };
  }
  if (job.status === "error") {
    return { tag: ANGLE_TAG.didntUpload, tone: job.terminal ? "info" : "negative", right: null, percent: null, helper: null };
  }
  const percent = pct(job.progress);
  return { tag: ANGLE_TAG.uploading, tone: "progress", right: percent != null ? `${percent}%` : null, percent, helper: null };
}

export function angleStatus(v: MatchDetailVideo, ctx: AngleStatusContext): AngleStatus {
  const local = v.is_mine && ctx.local ? ctx.local : null;
  // While the row has no playable bytes, this phone's job is the fresher
  // truth for "Your angle" (deck 2a, contradiction rule 1). A row that
  // already plays (an earlier recording, while a re-record uploads in the
  // wave 1 order) keeps saying what it is.
  if (local && !angleWatchable(v)) return localStatus(local);
  if (v.status === "uploading") {
    const percent = uploadPercent(v.upload_bytes_confirmed, v.upload_bytes_total);
    // `upload_in_flight` false: nothing heard from the uploading phone within
    // the server's grace window.
    if (v.upload_in_flight === false) {
      return {
        tag: ANGLE_TAG.paused,
        tone: "waiting",
        right: percent != null ? `${percent}%` : null,
        percent,
        helper: v.is_mine
          ? "Open ELO RATED on the phone that recorded to finish the upload."
          : `We haven't heard from ${ctx.name}'s phone for a few minutes. It picks up where it left off.`,
      };
    }
    return { tag: ANGLE_TAG.uploading, tone: "progress", right: percent != null ? `${percent}%` : null, percent, helper: null };
  }
  if (v.status === "failed" && v.failure_code === "upload_abandoned") {
    return {
      tag: ANGLE_TAG.didntUpload,
      tone: "info",
      right: null,
      percent: null,
      helper: v.is_mine ? "The upload didn't finish on the phone that recorded." : null,
    };
  }
  if (v.playability === "processing") return { tag: ANGLE_TAG.processing, tone: "waiting", right: null, percent: null, helper: null };
  if (v.playability === "failed") {
    // Red never appears on another person's angle (deck 0.5); deck 2c.
    if (!v.is_mine) {
      return { tag: ANGLE_TAG.notUsed, tone: "info", right: null, percent: null, helper: "This clip couldn't be processed." };
    }
    return { tag: ANGLE_TAG.analysisFailed, tone: "negative", right: null, percent: null, helper: null };
  }
  if (v.has_analysis) return { tag: ANGLE_TAG.breakdown, tone: "done", right: null, percent: null, helper: null };
  if (PIPELINE.has(v.status)) return { tag: ANGLE_TAG.analyzing, tone: "waiting", right: null, percent: null, helper: null };
  return { tag: ANGLE_TAG.ready, tone: "done", right: null, percent: null, helper: null };
}

/** True when the row can be watched (deck rule 4: only a ready angle plays). */
export function angleWatchable(v: Pick<MatchDetailVideo, "playability" | "status" | "failure_code">): boolean {
  return v.playability !== "processing" && !(v.status === "failed" && v.failure_code === "upload_abandoned");
}

/** True when the row has a usable file (not an abandoned or deleted reservation): the FILM count. */
export function angleCounts(v: Pick<MatchDetailVideo, "status" | "failure_code">): boolean {
  return v.status !== "deleted" && !(v.status === "failed" && v.failure_code === "upload_abandoned");
}

/** The short name to use in a helper, with the deck-safe fallback for a nameless timekeeper. */
export function angleOwnerName(
  v: Pick<MatchDetailVideo, "uploaded_by_name" | "recording_type">,
  opponentName: string | null | undefined,
  short: (name: string) => string,
): string {
  const raw = v.uploaded_by_name?.trim() || (v.recording_type === "timekeeper" ? null : opponentName?.trim() || null);
  if (raw) return short(raw);
  return v.recording_type === "timekeeper" ? "the timekeeper" : "your opponent";
}

/**
 * One screen-reader label for an angle row (deck 10.2): "{label}, {tag},
 * {helper}", with the Timekeeper tag and the percent when there is one.
 */
export function angleRowA11yLabel(label: string, roleTag: string | null, status: AngleStatus): string {
  return [label, roleTag, status.tag, status.right, status.helper].filter(Boolean).join(", ");
}

/** This phone's store entry as the row sees it: null once it landed (the server row is the truth then). */
export function localAngleJob(
  entry: Pick<MatchUploadEntry, "status" | "progress" | "errorClass"> & Partial<Pick<MatchUploadEntry, "error">> | null | undefined,
): LocalAngleJob | null {
  if (!entry || entry.status === "uploaded") return null;
  const terminal = entry.status === "error" && isTerminalUploadClass(entry.errorClass);
  return {
    status: entry.status,
    progress: entry.progress ?? null,
    terminal,
    message: entry.status === "paused" || entry.status === "error" ? (entry.error ?? null) : null,
    // A missing clip has nothing left to drop (uploadBannerActions).
    discardable: terminal && entry.errorClass !== "file_missing",
  };
}

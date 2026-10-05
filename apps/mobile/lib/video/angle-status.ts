import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { uploadPercent } from "@jits/shared/utils";

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
  analysisFailed: "Analysis failed · may still play",
} as const;

const PIPELINE = new Set(["processing", "slicing", "analyzing", "merging"]);

export interface AngleStatusContext {
  /** The uploader's short name (`M. Park`), for the helpers about their phone. */
  name: string;
  /**
   * THIS phone's upload progress (0..1) for the viewer's own angle, when a
   * local job exists: the local job wins over the server for that row (deck
   * 2a). Undefined/null: no local job.
   */
  localProgress?: number | null;
}

function pctOf(v: MatchDetailVideo, ctx: AngleStatusContext): number | null {
  if (v.is_mine && ctx.localProgress != null && Number.isFinite(ctx.localProgress)) {
    return Math.round(Math.max(0, Math.min(1, ctx.localProgress)) * 100);
  }
  return uploadPercent(v.upload_bytes_confirmed, v.upload_bytes_total);
}

export function angleStatus(v: MatchDetailVideo, ctx: AngleStatusContext): AngleStatus {
  const local = v.is_mine && ctx.localProgress != null;
  if (v.status === "uploading") {
    const percent = pctOf(v, ctx);
    // `upload_in_flight` false: nothing heard from the uploading phone within
    // the server's grace window. The recording phone's own job is fresher.
    if (v.upload_in_flight === false && !local) {
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
      helper: v.is_mine && !local ? "The upload didn't finish on the phone that recorded." : null,
    };
  }
  if (v.playability === "processing") return { tag: ANGLE_TAG.processing, tone: "waiting", right: null, percent: null, helper: null };
  if (v.playability === "failed") return { tag: ANGLE_TAG.analysisFailed, tone: "negative", right: null, percent: null, helper: null };
  if (v.has_analysis) return { tag: ANGLE_TAG.breakdown, tone: "done", right: null, percent: null, helper: null };
  if (PIPELINE.has(v.status)) return { tag: ANGLE_TAG.analyzing, tone: "waiting", right: null, percent: null, helper: null };
  return { tag: ANGLE_TAG.ready, tone: "done", right: null, percent: null, helper: null };
}

/** True when the row can be watched (deck rule 4: only a ready angle plays). */
export function angleWatchable(v: MatchDetailVideo): boolean {
  return v.playability !== "processing" && !(v.status === "failed" && v.failure_code === "upload_abandoned");
}

import type { AngleTone } from "./angle-status";
import type { MatchUploadEntry } from "./match-upload-store";
import { isTerminalUploadClass } from "./upload-errors";
import { isStripSuppressed, type StripSuppression } from "./upload-strip-visibility";
import { ROW_HELPER, STRIP_COPY } from "./video-status-copy";

/** How long "Match video uploaded" stays before the strip hides (deck section 3). */
export const STRIP_UPLOADED_MS = 4_000;

export type StripKind = "uploading" | "paused" | "failed" | "terminal" | "uploaded";

export interface UploadStripModel {
  kind: StripKind;
  /** The match the tap opens (the most recent job). */
  matchId: string;
  label: string;
  helper: string | null;
  /** Whole percent while uploading (combined over 2+ jobs), else null. */
  percent: number | null;
  tone: AngleTone;
  /** The strip's own 44 px Try again. */
  retry: boolean;
  /** "Details" on a terminal failure. */
  details: boolean;
  a11y: string;
}

function pct(p: number | null | undefined): number | null {
  return p != null && Number.isFinite(p) ? Math.round(Math.max(0, Math.min(1, p)) * 100) : null;
}

/** Combined percent of several uploads: byte-weighted when every size is known, else the mean. */
export function combinedPercent(jobs: Pick<MatchUploadEntry, "progress" | "bytesTotal">[]): number | null {
  const known = jobs.filter((j) => j.progress != null && Number.isFinite(j.progress));
  if (known.length === 0) return null;
  const sized = known.every((j) => j.bytesTotal != null && j.bytesTotal > 0);
  if (sized) {
    const total = known.reduce((s, j) => s + (j.bytesTotal as number), 0);
    const done = known.reduce((s, j) => s + (j.bytesTotal as number) * Math.max(0, Math.min(1, j.progress as number)), 0);
    return Math.round((done / total) * 100);
  }
  return Math.round((known.reduce((s, j) => s + Math.max(0, Math.min(1, j.progress as number)), 0) / known.length) * 100);
}

/**
 * What the app-wide upload strip says (jits-n2im.2, COPY-DECK v2.2 section 3,
 * boards P-VS-01 / P-VS-02), from the store's outstanding jobs (uploading,
 * paused, failed; most recent first, `useActiveMatchUploads`), a just-landed
 * job (the 4 s "uploaded" flash) and where the strip is suppressed. Null
 * hides it. Pure, so the visibility rules are one table.
 */
export function deriveUploadStrip(
  jobs: MatchUploadEntry[],
  flashMatchId: string | null,
  suppressions: StripSuppression[],
): UploadStripModel | null {
  const visible = jobs.filter((j) => !isStripSuppressed(suppressions, j.matchId));
  if (visible.length === 0) {
    if (flashMatchId && !isStripSuppressed(suppressions, flashMatchId)) {
      return { kind: "uploaded", matchId: flashMatchId, label: STRIP_COPY.uploaded, helper: null, percent: null, tone: "done", retry: false, details: false, a11y: STRIP_COPY.a11yUploaded };
    }
    return null;
  }
  const top = visible[0];
  const allUploading = visible.every((j) => j.status === "uploading");
  if (top.status === "uploading" || allUploading) {
    const many = allUploading && visible.length >= 2;
    const label = many ? STRIP_COPY.uploadingMany(visible.length) : STRIP_COPY.uploading;
    const percent = many ? combinedPercent(visible) : pct(top.progress);
    return { kind: "uploading", matchId: top.matchId, label, helper: null, percent, tone: "progress", retry: false, details: false, a11y: STRIP_COPY.a11yUploading(label, percent) };
  }
  if (top.status === "paused") {
    return { kind: "paused", matchId: top.matchId, label: STRIP_COPY.paused, helper: top.error ?? null, percent: null, tone: "waiting", retry: true, details: false, a11y: STRIP_COPY.a11yPaused };
  }
  // "error": red with Try again while a retry can work; grey otherwise.
  if (isTerminalUploadClass(top.errorClass)) {
    const helper = top.error ?? ROW_HELPER.clipGone;
    return { kind: "terminal", matchId: top.matchId, label: STRIP_COPY.failed, helper, percent: null, tone: "info", retry: false, details: true, a11y: STRIP_COPY.a11yTerminal(helper) };
  }
  return { kind: "failed", matchId: top.matchId, label: STRIP_COPY.failed, helper: top.error ?? ROW_HELPER.uploadDidntFinish, percent: null, tone: "negative", retry: true, details: false, a11y: STRIP_COPY.a11yFailed };
}

/** The compact line under End / Result / Confirm (deck section 3), or null with no job. */
export interface CompactLineModel {
  kind: "preparing" | "uploading" | "paused" | "failed" | "terminal" | "uploaded";
  text: string;
  percent: number | null;
  tone: AngleTone;
  retry: boolean;
}

export function deriveCompactLine(entry: MatchUploadEntry | null, copy: Record<CompactLineModel["kind"], string>): CompactLineModel | null {
  if (!entry) return null;
  switch (entry.status) {
    case "pending":
      return { kind: "preparing", text: copy.preparing, percent: null, tone: "progress", retry: false };
    case "uploading":
      return { kind: "uploading", text: copy.uploading, percent: pct(entry.progress), tone: "progress", retry: false };
    case "paused":
      return { kind: "paused", text: copy.paused, percent: null, tone: "waiting", retry: true };
    case "uploaded":
      return { kind: "uploaded", text: copy.uploaded, percent: null, tone: "done", retry: false };
    default:
      return isTerminalUploadClass(entry.errorClass)
        ? { kind: "terminal", text: copy.terminal, percent: null, tone: "info", retry: false }
        : { kind: "failed", text: copy.failed, percent: null, tone: "negative", retry: true };
  }
}

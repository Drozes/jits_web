import * as React from "react";
import { AccessibilityInfo, Platform } from "react-native";
import type { UploadBannerState } from "./upload-banner-state";

/** Progress milestones announced on iOS, as fractions. */
export const UPLOAD_ANNOUNCE_MILESTONES = [0.25, 0.5, 0.75] as const;

/**
 * What VoiceOver should say for a state, or null for nothing.
 * Exported for tests; the hook decides WHEN.
 */
export function uploadAnnouncement(state: UploadBannerState): string | null {
  switch (state.kind) {
    case "uploading":
      return "Uploading match video";
    case "paused":
      return state.message ?? "Upload paused";
    case "uploaded":
      return state.truncation ? "Match video uploaded, but the clip stops before the end of the match" : "Match video uploaded";
    case "error":
      return state.message ?? "Upload failed";
    default:
      return null;
  }
}

/** The highest milestone a progress value has crossed, or -1. */
function milestoneOf(progress: number | null): number {
  if (progress == null || !Number.isFinite(progress)) return -1;
  let hit = -1;
  UPLOAD_ANNOUNCE_MILESTONES.forEach((m, i) => {
    if (progress >= m) hit = i;
  });
  return hit;
}

/**
 * VoiceOver announcements for the upload status (jits-5tj9.2).
 *
 * `accessibilityLiveRegion` is Android-only in React Native, so on iOS the
 * status changed from uploading to uploaded or failed in total silence.
 * This announces every change of KIND (uploading, paused, uploaded,
 * failed) and each progress milestone (25, 50, 75%) once, through
 * `AccessibilityInfo.announceForAccessibility`. Android keeps its live
 * region and is not announced twice. Not on mount for a state that was
 * already showing: only a real change is news.
 */
export function useUploadAnnouncements(state: UploadBannerState): void {
  const lastKind = React.useRef<string | null>(null);
  const lastMilestone = React.useRef(-1);
  const mounted = React.useRef(false);
  const { kind, message, truncation } = state;
  const milestone = kind === "uploading" ? milestoneOf(state.progress) : -1;

  React.useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    const kindChanged = lastKind.current !== kind;
    const crossed = kind === "uploading" && milestone > lastMilestone.current;
    lastKind.current = kind;
    if (kind !== "uploading") lastMilestone.current = -1;
    else if (crossed) lastMilestone.current = milestone;
    if (first || Platform.OS !== "ios") return;

    let text: string | null = null;
    if (kindChanged) text = uploadAnnouncement({ kind, message, truncation, progress: null });
    else if (crossed) text = `Upload ${Math.round(UPLOAD_ANNOUNCE_MILESTONES[milestone] * 100)} percent`;
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [kind, milestone, message, truncation]);
}

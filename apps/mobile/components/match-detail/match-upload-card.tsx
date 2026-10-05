import * as React from "react";
import { UploadProgressBanner } from "@/components/match-flow/upload-progress-banner";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { deriveUploadBannerState } from "@/lib/video/upload-banner-state";
import { useUploadActions } from "@/lib/video/use-upload-actions";

/**
 * This phone's upload for the match, on the match page (jits-n2im.4): the
 * same card the verdict shows, with Retry / Discard, so the two surfaces
 * can never disagree. No recorder here, so the store alone decides.
 */
export function MatchUploadCard({ matchId, entry }: { matchId: string; entry: MatchUploadEntry }) {
  const { retry, discard } = useUploadActions(matchId);
  // A "pending" entry (recording started, upload not yet) reads as hidden
  // in the banner table; on this page it is an upload about to start.
  const state = deriveUploadBannerState("idle", null, entry.status === "pending" ? { ...entry, status: "uploading" } : entry);
  return <UploadProgressBanner {...state} onRetry={retry} onDiscard={discard} />;
}

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { useVideoProgress } from "@jits/shared/hooks/use-video-progress";
import { buildKeyMoments, defaultMatchAngle, isNoMatch, type KeyMoment } from "@jits/shared/utils";
import type { MatchDetailView, MatchDetailVideo } from "@jits/shared/api/queries";
import { useMatchUpload, type MatchUploadEntry } from "@/lib/video/match-upload-store";
import type { VideoAnalysis } from "@jits/shared/api/film-room";
import { useVideoAnalysis, type AnalysisState } from "@/lib/film-room/use-video-analysis";
import { filmStillCaption } from "@/lib/video/upload-copy";

/** What the AI BREAKDOWN plate shows for the selected angle. */
export type BreakdownPhase =
  | { kind: "analysis"; state: AnalysisState; analysis: VideoAnalysis | null }
  | { kind: "analyzing"; done: number | null; total: number | null }
  | { kind: "failed" }
  | { kind: "uploading" };

const PIPELINE = new Set(["ready", "processing", "slicing", "analyzing", "merging"]);
const MAX_TAGS = 8;

export interface MatchFilm {
  active: MatchDetailVideo | null;
  setActiveId: (id: string) => void;
  phase: BreakdownPhase | null;
  moments: KeyMoment[];
  tags: string[];
  /** Hero fallback caption. */
  fallbackLabel: string;
  /** This phone's upload entry for the match (null when none). */
  localUpload: MatchUploadEntry | null;
  /** Why the hero has no play button while the film exists, else null. */
  playHint: string | null;
  retryAnalysis: () => void;
}

/**
 * Everything the match page derives from its recordings: the selected angle
 * (the server-elected primary, else the viewer's own first), live analysis progress while it runs (re-reading
 * the breakdown the moment the merge lands), the breakdown itself, its key
 * moments and technique tags, and the hero's fallback caption.
 */
export function useMatchFilm(view: MatchDetailView | null, matchId: string): MatchFilm {
  const videos = view?.videos ?? [];
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // The server-elected primary angle is the default (jits-n2im.15), else the
  // viewer's own, then the server's order. A pick by the athlete wins.
  const active = videos.find((v) => v.id === activeId) ?? defaultMatchAngle(videos);

  const watching =
    !!active && !active.has_analysis && active.playability === "playable" && PIPELINE.has(active.status);
  const progress = useVideoProgress(supabase, watching ? active.id : null);
  const analyzedNow = watching && progress.data?.status === "analyzed";
  const [key, setKey] = React.useState(0);
  React.useEffect(() => {
    if (analyzedNow) setKey((k) => k + 1);
  }, [analyzedNow]);

  const { state, analysis, retry } = useVideoAnalysis(
    active && (active.has_analysis || analyzedNow) ? active.id : null,
    key,
  );
  const upload = useMatchUpload(matchId);
  const uploading = upload?.status === "uploading" || upload?.status === "pending";

  // No match in the video: no key moments and no tags. The shared parser
  // already empties that data for a no-match analysis; this keeps the page
  // honest even if a stray entry ever slipped through.
  const noMatch = isNoMatch(analysis);
  const moments = React.useMemo(
    () => (analysis && !noMatch ? buildKeyMoments(analysis, view?.match ?? null, active?.duration_seconds) : []),
    [analysis, noMatch, view?.match, active?.duration_seconds],
  );
  const tags = React.useMemo(
    () =>
      noMatch ? [] : [...new Set((analysis?.technique_tags ?? []).map((t) => t.technique_name))].slice(0, MAX_TAGS),
    [analysis, noMatch],
  );

  let phase: BreakdownPhase | null = null;
  if (active) {
    if (active.playability === "processing") phase = { kind: "uploading" };
    else if (active.playability === "failed") phase = { kind: "failed" };
    else if (active.has_analysis || analyzedNow) phase = { kind: "analysis", state, analysis };
    else if (watching && progress.data && (progress.data.status !== "ready" || progress.data.chunk_count)) {
      // "ready" with no chunks yet is queued for slicing, not analyzing.
      phase = { kind: "analyzing", done: progress.data.chunks_completed, total: progress.data.chunk_count };
    } else phase = { kind: "analysis", state: "none", analysis: null };
  } else if (uploading) phase = { kind: "uploading" };

  // Once the bytes are in, the still is waiting on processing, never on
  // the upload (jits-n2im.4 item 6).
  const fallbackLabel = filmStillCaption(upload, videos.length > 0, "NO FILM RECORDED");
  const playHint = active && active.playability === "processing" ? (active.status === "uploading" ? "UPLOADING" : "PROCESSING") : null;

  return { active, setActiveId, phase, moments, tags, fallbackLabel, localUpload: upload, playHint, retryAnalysis: retry };
}

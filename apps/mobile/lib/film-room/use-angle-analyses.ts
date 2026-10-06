import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getVideoAnalysis, type VideoAnalysis } from "@jits/shared/api/film-room";
import type { AnalysisState } from "@/lib/film-room/use-video-analysis";

interface Entry {
  state: AnalysisState;
  analysis: VideoAnalysis | null;
}

/**
 * The breakdown of every angle of a match, read up front (jits-xfvd.16,
 * contract 4.4), so an angle switch swaps the player's chrome (caption, seek
 * markers, moment chips) in one render at landing instead of waiting on a
 * read for the new angle.
 *
 * Each id is read once with `getVideoAnalysis`, in parallel, as soon as it
 * appears in `videoIds`; a changed list reads only the new ids (earlier
 * results are kept). Results that arrive after unmount are dropped.
 * `analysisFor` / `stateFor` take any id: one never requested reads as
 * "idle" with no analysis. The player passes the angle on screen plus every
 * playable angle of the match.
 */
export function useAngleAnalyses(videoIds: string[]): {
  analysisFor: (videoId: string | null | undefined) => VideoAnalysis | null;
  stateFor: (videoId: string | null | undefined) => AnalysisState;
} {
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const requestedRef = React.useRef(new Set<string>());
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A stable key, so a new array with the same ids reads nothing.
  const key = Array.from(new Set(videoIds.filter(Boolean))).join(",");

  React.useEffect(() => {
    if (!key) return;
    const fresh = key.split(",").filter((id) => !requestedRef.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) requestedRef.current.add(id);
    setEntries((prev) => {
      const next = { ...prev };
      for (const id of fresh) next[id] = { state: "loading", analysis: null };
      return next;
    });
    for (const id of fresh) {
      void (async () => {
        const result = await getVideoAnalysis(supabase, id);
        if (!mountedRef.current) return;
        const entry: Entry = !result.ok
          ? { state: "error", analysis: null }
          : { state: result.data ? "ready" : "none", analysis: result.data };
        setEntries((prev) => ({ ...prev, [id]: entry }));
      })();
    }
  }, [key]);

  const analysisFor = React.useCallback(
    (videoId: string | null | undefined) => (videoId ? entries[videoId]?.analysis ?? null : null),
    [entries],
  );
  const stateFor = React.useCallback(
    (videoId: string | null | undefined): AnalysisState => (videoId ? entries[videoId]?.state ?? "idle" : "idle"),
    [entries],
  );
  return { analysisFor, stateFor };
}

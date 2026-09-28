import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getVideoAnalysis, type VideoAnalysis } from "@jits/shared/api/film-room";

export type AnalysisState = "idle" | "loading" | "ready" | "none" | "error";

/**
 * The merged breakdown for one video. Pass null (no video, or one without an
 * analysis yet) to skip the read. `key` re-reads when it changes, which the
 * match page bumps when a live progress update says the merge just finished.
 * useEffect + cancelled flag, like the other mobile fetch hooks.
 */
export function useVideoAnalysis(videoId: string | null, key: number = 0) {
  const [state, setState] = React.useState<AnalysisState>(videoId ? "loading" : "idle");
  const [analysis, setAnalysis] = React.useState<VideoAnalysis | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!videoId) {
      setState("idle");
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    setState("loading");
    void (async () => {
      const result = await getVideoAnalysis(supabase, videoId);
      if (cancelled) return;
      if (!result.ok) {
        setAnalysis(null);
        setState("error");
        return;
      }
      setAnalysis(result.data);
      setState(result.data ? "ready" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId, key, tick]);

  const retry = React.useCallback(() => setTick((n) => n + 1), []);
  return { state, analysis, retry };
}

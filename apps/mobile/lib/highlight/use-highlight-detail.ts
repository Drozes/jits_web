import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import type { DomainError } from "@jits/shared/api/errors";
import { getHighlightDetail, type HighlightDetail } from "@jits/shared/api/highlight-share";

export interface UseHighlightDetailResult {
  detail: HighlightDetail | null;
  error: DomainError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * The viewer's context for one of the athlete's OWN reels
 * (`get_highlight_detail`): ids, live version, both flags and the caption
 * facts. Read on mount and on `reload`; only the newest read may write, and
 * none after unmount (the screen can be closed mid-fetch).
 */
export function useHighlightDetail(highlightId: string | undefined): UseHighlightDetailResult {
  const [detail, setDetail] = React.useState<HighlightDetail | null>(null);
  const [error, setError] = React.useState<DomainError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (!highlightId) {
      setError({ code: "HIGHLIGHT_NOT_FOUND", message: "No highlight id." });
      setLoading(false);
      return;
    }
    setLoading(true);
    void getHighlightDetail(supabase, highlightId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDetail(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [highlightId, tick]);

  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  return { detail, error, loading, reload };
}

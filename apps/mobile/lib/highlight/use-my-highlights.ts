import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyHighlights, type MyHighlightItem } from "@jits/shared/api/highlight-share";
import { signPosterKey } from "@jits/shared/api/queries";

/** Tiles on the Profile row (spec 014 section 16.6.5). */
export const PROFILE_HIGHLIGHTS_LIMIT = 10;
const POSTER_TTL_S = 3600;

export interface ProfileHighlight extends MyHighlightItem {
  /** Signed poster, null when there is none or signing failed. */
  posterUrl: string | null;
}

export interface UseMyHighlightsResult {
  items: ProfileHighlight[];
  /** `highlight_clips_enabled`; false (fail-closed) until a read succeeds. */
  clipsEnabled: boolean;
  refetch: () => void;
  /** Clear a tile's NEW tag at once (the viewer marks it seen server side). */
  markSeenLocally: (highlightId: string) => void;
}

/**
 * The athlete's own ready reels, newest first, for the Profile row. Posters
 * are signed in the private bucket (best effort). Only the newest read may
 * write, none after unmount; a failed read keeps what is on screen (the row
 * is a quiet discovery surface and never shows an error).
 */
export function useMyHighlights(athleteId: string | undefined): UseMyHighlightsResult {
  const [state, setState] = React.useState<{ items: ProfileHighlight[]; clipsEnabled: boolean }>({
    items: [],
    clipsEnabled: false,
  });
  const seq = React.useRef(0);
  React.useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const refetch = React.useCallback(() => {
    const id = ++seq.current;
    if (!athleteId) return;
    void (async () => {
      const res = await getMyHighlights(supabase, { limit: PROFILE_HIGHLIGHTS_LIMIT });
      if (id !== seq.current || !res.ok) return;
      const posters = await Promise.all(
        res.data.items.map((item) => signPosterKey(supabase, item.posterPath, POSTER_TTL_S)),
      );
      if (id !== seq.current) return;
      setState({
        clipsEnabled: res.data.clipsEnabled,
        items: res.data.items.map((item, i) => ({ ...item, posterUrl: posters[i] })),
      });
    })();
  }, [athleteId]);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  const markSeenLocally = React.useCallback((highlightId: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.highlightId === highlightId ? { ...item, unseen: false } : item)),
    }));
  }, []);

  return { ...state, refetch, markSeenLocally };
}

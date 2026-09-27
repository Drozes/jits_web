import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import type { DomainError } from "../api/errors";
import {
  getHighlightProgress,
  HIGHLIGHT_ACTIVE_PHASES,
  type HighlightProgress,
} from "../api/highlights";

/** Realtime bursts (a render touches the row several times) collapse into one read. */
export const HIGHLIGHT_REFRESH_DEBOUNCE_MS = 200;
/**
 * Plans are not in the realtime publication (service-role table), so while a
 * reel is still moving the hook also polls. Never in a settled phase.
 */
export const HIGHLIGHT_POLL_MS = 15_000;

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

function clearTimer(ref: TimerRef): void {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

export interface UseHighlightProgressResult {
  /** Latest snapshot; `null` until the first read succeeds. Kept on a failed refetch. */
  data: HighlightProgress | null;
  /** True until the first read for the current id settles. */
  loading: boolean;
  /** The most recent read's error; cleared by the next success. */
  error: DomainError | null;
  /** Read now (cancels a pending debounced read). */
  refresh: () => void;
}

/**
 * Live state of the caller's own highlight reel for one match video
 * (jr_be spec 014 section 9.2).
 *
 * One channel `highlight_progress:{id}` with postgres_changes on
 * `video_highlights` (match_video_id) and `match_videos` (id), each event a
 * debounced refetch of `get_highlight_progress`; plus a 15 s poll only in
 * `waiting_for_analysis` / `planning` / `rendering` / `regenerating`.
 * Responses are version-gated like `useVideoProgress`, so a slow read for a
 * previous id (or after unmount) never lands.
 *
 * Platform-agnostic: it does not watch app foreground/background. Callers
 * call `refresh()` on foreground (mobile does, via AppState).
 */
export function useHighlightProgress(
  supabase: SupabaseClient<Database>,
  matchVideoId: string | null,
): UseHighlightProgressResult {
  const [data, setData] = useState<HighlightProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(!!matchVideoId);
  const [error, setError] = useState<DomainError | null>(null);

  const versionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(
    async (id: string, myVersion: number) => {
      const result = await getHighlightProgress(supabase, id);
      if (myVersion !== versionRef.current) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    },
    [supabase],
  );

  const refresh = useCallback(() => {
    if (!matchVideoId) return;
    clearTimer(debounceRef);
    void fetchSnapshot(matchVideoId, versionRef.current);
  }, [matchVideoId, fetchSnapshot]);

  useEffect(() => {
    versionRef.current += 1;
    const myVersion = versionRef.current;
    setData(null);
    setError(null);
    if (!matchVideoId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchSnapshot(matchVideoId, myVersion);

    const schedule = () => {
      clearTimer(debounceRef);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void fetchSnapshot(matchVideoId, myVersion);
      }, HIGHLIGHT_REFRESH_DEBOUNCE_MS);
    };

    const channel: RealtimeChannel = supabase
      .channel(`highlight_progress:${matchVideoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_highlights",
          filter: `match_video_id=eq.${matchVideoId}`,
        },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_videos", filter: `id=eq.${matchVideoId}` },
        schedule,
      )
      .subscribe();

    return () => {
      // Bump so an in-flight read for this id is ignored after teardown.
      versionRef.current += 1;
      clearTimer(debounceRef);
      void supabase.removeChannel(channel);
    };
    // fetchSnapshot only changes with supabase, already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, matchVideoId]);

  const phase = data?.phase ?? null;
  const polling = phase !== null && HIGHLIGHT_ACTIVE_PHASES.has(phase);

  useEffect(() => {
    if (!polling || !matchVideoId) return;
    const myVersion = versionRef.current;
    const timer = setInterval(() => {
      void fetchSnapshot(matchVideoId, myVersion);
    }, HIGHLIGHT_POLL_MS);
    return () => clearInterval(timer);
  }, [polling, matchVideoId, fetchSnapshot]);

  return useMemo(() => ({ data, loading, error, refresh }), [data, loading, error, refresh]);
}

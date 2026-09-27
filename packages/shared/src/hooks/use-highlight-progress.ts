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

/** Phases with nothing to watch: no realtime subscription. */
const HIGHLIGHT_QUIET_PHASES: ReadonlySet<string> = new Set(["disabled", "unavailable"]);

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
 * One channel `highlight_progress:{id}:{mount}` (opened only after a read
 * returns a phase other than disabled / unavailable) with postgres_changes on
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

  // Which id the state belongs to: a response for a previous id (or after
  // unmount) never lands.
  const versionRef = useRef(0);
  // Per-request sequence: a slower OLDER response for the same id never
  // overwrites a newer one that already landed.
  const seqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(
    async (id: string, myVersion: number) => {
      const mySeq = ++seqRef.current;
      const result = await getHighlightProgress(supabase, id);
      if (myVersion !== versionRef.current) return;
      if (mySeq < appliedSeqRef.current) return;
      appliedSeqRef.current = mySeq;
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

  // Initial read per id.
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
    return () => {
      // Bump so an in-flight read for this id is ignored after teardown.
      versionRef.current += 1;
      clearTimer(debounceRef);
    };
  }, [matchVideoId, fetchSnapshot]);

  // Realtime only once a successful read says there is something to watch:
  // no socket traffic for the (common) disabled / unavailable reel.
  // Only a snapshot of THIS id counts (the reset to null on an id change
  // lands in the same commit, but never trust it across ids).
  const current = data && data.matchVideoId === matchVideoId ? data : null;
  const phase = current?.phase ?? null;
  const live = phase !== null && !HIGHLIGHT_QUIET_PHASES.has(phase);

  useEffect(() => {
    if (!live || !matchVideoId) return;
    const myVersion = versionRef.current;
    const schedule = () => {
      clearTimer(debounceRef);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void fetchSnapshot(matchVideoId, myVersion);
      }, HIGHLIGHT_REFRESH_DEBOUNCE_MS);
    };

    // The topic must be unique per hook INSTANCE: `supabase.channel(topic)`
    // returns the EXISTING channel while one with that topic is registered,
    // and `.on()` after subscribe() throws. Two cards for the same video
    // (match detail pushed twice via the opponent profile) would crash, and
    // the second unmount's removeChannel would kill the first's realtime.
    // Same defence as use-pending-challenges.ts.
    const mountId = Math.random().toString(36).slice(2, 10);
    const channel: RealtimeChannel = supabase
      .channel(`highlight_progress:${matchVideoId}:${mountId}`)
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
      clearTimer(debounceRef);
      void supabase.removeChannel(channel);
    };
  }, [live, supabase, matchVideoId, fetchSnapshot]);

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

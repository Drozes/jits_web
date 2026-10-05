import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Coalesces a burst of row events into one refetch. Each refetch is a
 * `get_match_details` plus poster signing, and the slicer bumps
 * `chunks_completed` once per chunk, so this is deliberately not snappy.
 */
export const MATCH_VIDEOS_REALTIME_DEBOUNCE_MS = 2_000;

let channelSeq = 0;

/**
 * Match-level realtime for `match_videos` (jits-n2im.12).
 *
 * Calls `onChange` (debounced) whenever a `match_videos` row of `matchId` is
 * inserted or updated: a new angle reserved by the other athlete or the
 * timekeeper, an upload heartbeat (`upload_bytes_confirmed`), the land flip,
 * the poster or `normalized_path` arriving, a pipeline status change. The
 * caller refetches `get_match_details` in it; this hook carries no data of
 * its own, so every surface keeps one source of truth (the RPC).
 *
 * RLS limits the events to rows the viewer may read (the match's
 * participants, and its timekeeper once jr_be-1qz.7 admits them).
 *
 * A rejoin after the socket dropped also calls `onChange`, because events
 * that fired while the channel was down are not replayed. The first join does
 * not: the caller fetched on mount.
 *
 * Reuse: the match video status UX (jits-n2im.25 / JW-S1) mounts this same
 * hook; it takes the client as a parameter like every shared hook, so web can
 * mount it too. Pass `null` to stay unsubscribed.
 *
 * Returns `subscribed`: false until the channel has joined (and again while
 * it is down), so a caller can keep a slow fallback refetch for a socket
 * that never connects.
 */
export function useMatchVideosRealtime(
  supabase: SupabaseClient<Database>,
  matchId: string | null | undefined,
  onChange: () => void,
  debounceMs: number = MATCH_VIDEOS_REALTIME_DEBOUNCE_MS,
): { subscribed: boolean } {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    setSubscribed(false);
    if (!matchId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let joined = false;
    let disposed = false;

    const schedule = () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!disposed) onChangeRef.current();
      }, debounceMs);
    };

    const onRow = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      // The server filter already scopes to this match; checked again so a
      // misrouted or unfiltered event can never refetch the wrong screen.
      const row = payload.new ?? payload.old ?? null;
      if (row && row.match_id != null && row.match_id !== matchId) return;
      schedule();
    };

    channelSeq += 1;
    const filter = `match_id=eq.${matchId}`;
    // A unique topic per mount: two surfaces watching the same match must not
    // share (and then tear down) one channel.
    const channel: RealtimeChannel = supabase
      .channel(`match_videos:${matchId}:${channelSeq}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_videos", filter }, onRow)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_videos", filter }, onRow)
      .subscribe((status: string) => {
        if (disposed) return;
        if (status !== "SUBSCRIBED") {
          setSubscribed(false);
          return;
        }
        setSubscribed(true);
        if (joined) schedule();
        joined = true;
      });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, matchId, debounceMs]);

  return { subscribed };
}

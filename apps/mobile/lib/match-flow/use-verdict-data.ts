import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMatchDetailView } from "@jits/shared/api/queries";
import { getMatchRankChange, type MatchRankChange } from "@jits/shared/api/match-rank-change";

/** Re-read the match's videos this often while a poster is still missing. */
export const POSTER_POLL_MS = 20_000;
/** ...at most this many times per verdict (the slicer takes a while). */
export const POSTER_POLL_LIMIT = 6;

export interface VerdictVideos {
  /** Any `match_videos` row on this match, from either athlete. */
  hasVideo: boolean;
  /** Signed opening still (the slicer poster), when one exists yet. */
  posterUrl: string | null;
  /**
   * Stable image cache key: the poster's storage key (thumbnail key), the same
   * key the Film Room's OpeningStill caches under, so the match page reuses
   * the verdict's still. Falls back to the video id.
   */
  posterKey: string | null;
}

const EMPTY: VerdictVideos = { hasVideo: false, posterUrl: null, posterKey: null };

/**
 * The verdict's opening still: the match's videos via `getMatchDetailView`
 * (participant-gated, posters signed). Re-read when this device's upload
 * lands (`uploadedKey` changes) and on a bounded poll while a video exists
 * without a poster. Any failure keeps what is in hand.
 */
export function useVerdictVideos(matchId: string, viewerId: string, uploadedKey: string | null): VerdictVideos {
  const [videos, setVideos] = React.useState<VerdictVideos>(EMPTY);
  const [tick, setTick] = React.useState(0);
  const pollsRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    // Through a resolved promise so even a synchronous throw lands in catch.
    void Promise.resolve()
      .then(() => getMatchDetailView(supabase, matchId, viewerId))
      .then((res) => {
        if (cancelled || !res.ok) return;
        const list = res.data.videos;
        const withPoster = list.find((v) => v.poster_url);
        setVideos({
          hasVideo: list.length > 0,
          posterUrl: withPoster?.poster_url ?? null,
          posterKey: withPoster ? (withPoster.thumbnail_key ?? withPoster.id) : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matchId, viewerId, uploadedKey, tick]);

  const needsPoll = videos.posterUrl == null && (videos.hasVideo || uploadedKey != null);
  React.useEffect(() => {
    if (!needsPoll || pollsRef.current >= POSTER_POLL_LIMIT) return;
    const t = setTimeout(() => {
      pollsRef.current += 1;
      setTick((n) => n + 1);
    }, POSTER_POLL_MS);
    return () => clearTimeout(t);
  }, [needsPoll, tick]);

  return videos;
}

/**
 * The viewer's Rankings move for this match (B6). Null while loading, for a
 * casual match, and whenever the RPC is unavailable (older backend): the
 * verdict then simply shows no rank strip.
 */
export function useRankChange(matchId: string, enabled: boolean): MatchRankChange | null {
  const [change, setChange] = React.useState<MatchRankChange | null>(null);
  React.useEffect(() => {
    setChange(null);
    if (!enabled) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getMatchRankChange(supabase, matchId))
      .then((res) => {
        if (!cancelled && res.ok) setChange(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matchId, enabled]);
  return change;
}

/**
 * "#23 -> #19 · PASSED J. SILVA", or null when there is nothing worth a
 * strip (unranked on either side, or no improvement).
 */
export function rankStripText(change: MatchRankChange | null, short: (name: string) => string): string | null {
  if (!change || change.direction !== "up") return null;
  if (change.rank_before == null || change.rank_after == null || change.rank_after >= change.rank_before) return null;
  const base = `#${change.rank_before} \u2192 #${change.rank_after}`;
  const first = change.passed[0];
  if (!first) return base;
  // The uncapped count: "passed" itself holds at most three.
  const others = Math.max(change.passed_total, change.passed.length) - 1;
  const more = others > 0 ? ` +${others}` : "";
  return `${base} \u00b7 PASSED ${short(first.display_name).toUpperCase()}${more}`;
}

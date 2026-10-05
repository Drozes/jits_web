import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { getMatchDetailView, type MatchDetailVideo } from "@jits/shared/api/queries";
import { useMatchVideosRealtime } from "@jits/shared/hooks/use-match-videos-realtime";
import { defaultMatchAngle } from "@jits/shared/utils";
import { getMatchRankChange, type MatchRankChange } from "@jits/shared/api/match-rank-change";

export interface VerdictVideos {
  /** Any `match_videos` row on this match, from either athlete. */
  hasVideo: boolean;
  /** At least one angle can be played now (deck rule 4: only then "Watch film"). */
  hasPlayable: boolean;
  /** Signed opening still (the slicer poster), when one exists yet. */
  posterUrl: string | null;
  /**
   * Stable image cache key: the poster's storage key (thumbnail key), the same
   * key the Film Room's OpeningStill caches under, so the match page reuses
   * the verdict's still. The video-id fallback is effectively unreachable:
   * getMatchDetailView only signs a poster_url from a non-null thumbnail_url,
   * which is also what thumbnail_key carries. It stays as a type-level guard
   * (thumbnail_key is optional in the type) and for hand-built fixtures.
   */
  posterKey: string | null;
  /**
   * The other athletes' angles (the opponent's, the timekeeper's), in deck
   * row order, for the verdict's angle rows (jits-n2im.12). The viewer's own
   * angle is not here: this phone's upload card speaks for it.
   */
  others: MatchDetailVideo[];
}

const EMPTY: VerdictVideos = { hasVideo: false, hasPlayable: false, posterUrl: null, posterKey: null, others: [] };

/**
 * The opening still: the server-elected primary's poster when it has one
 * (jits-n2im.15), else the first angle that has one.
 */
function posterSource(list: MatchDetailVideo[]): MatchDetailVideo | null {
  const primary = defaultMatchAngle(list);
  if (primary?.is_primary && primary.poster_url) return primary;
  return list.find((v) => v.poster_url) ?? null;
}

/**
 * The verdict's videos: the match's angles via `getMatchDetailView`
 * (participant-gated, posters signed). Re-read when this device's upload
 * lands (`uploadedKey` changes) and on every `match_videos` change for the
 * match over realtime (jits-n2im.12): the other athlete's angle being
 * reserved, its upload %, the poster and the pipeline arriving. This
 * replaced the backing-off poster poll. Any failure keeps what is in hand.
 */
export function useVerdictVideos(matchId: string, viewerId: string, uploadedKey: string | null): VerdictVideos {
  const [videos, setVideos] = React.useState<VerdictVideos>(EMPTY);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    // Through a resolved promise so even a synchronous throw lands in catch.
    void Promise.resolve()
      .then(() => getMatchDetailView(supabase, matchId, viewerId))
      .then((res) => {
        if (cancelled || !res.ok) return;
        const list = res.data.videos;
        const withPoster = posterSource(list);
        setVideos({
          hasVideo: list.length > 0,
          hasPlayable: list.some((v) => v.playability === "playable"),
          posterUrl: withPoster?.poster_url ?? null,
          posterKey: withPoster ? (withPoster.thumbnail_key ?? withPoster.id) : null,
          others: list.filter((v) => !v.is_mine),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matchId, viewerId, uploadedKey, tick]);

  const refetch = React.useCallback(() => setTick((n) => n + 1), []);
  useMatchVideosRealtime(supabase, matchId, refetch);

  return videos;
}

/**
 * The viewer's Rankings move for this match (B6). Null while loading, when
 * not enabled (the verdict asks only on a win), and whenever the RPC is
 * unavailable (older backend): the verdict then simply shows no rank strip.
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

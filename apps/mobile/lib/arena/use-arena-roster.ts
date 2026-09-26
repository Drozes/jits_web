/**
 * The Arena roster: everyone flagged as looking for a ranked match.
 *
 * Presence decides which of them are online; this hook only supplies the
 * people. See `use-lobby-presence.ts` for the other half of the split.
 */
import * as React from "react";
import { getArenaData } from "@jits/shared/api/queries";
import type { ArenaData } from "@jits/shared/types/composites";
import { supabase } from "../supabase/client";
import { useMatchExitCount } from "./arena-store";
import { ARENA_ROSTER_LIMIT } from "./constants";

export interface ArenaCompetitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName?: string;
  weight?: number;
  profilePhotoUrl?: string | null;
  /** Opponent ELO minus yours: a strength GAP, not a rating change. */
  eloDiff: number;
  /**
   * `looking_for_ranked`. The `challenges_insert` RLS policy calls
   * `opponent_accepts_match_type(opponent_id, 'ranked')`, which is literally
   * this column, so a ranked challenge to an athlete without it is rejected by
   * the database. The roster still lists them (they are open to a casual
   * match) but the Challenge affordance has to come off, or the row promises
   * something the server will refuse.
   */
  acceptsRanked: boolean;
}

export interface UseArenaRosterResult {
  competitors: ArenaCompetitor[];
  /** Opponent ids with a pending challenge in EITHER direction. */
  challengedIds: Set<string>;
  isLoading: boolean;
  isRefreshing: boolean;
  /** True when the last read failed. Distinct from an empty roster. */
  hasError: boolean;
  refresh: () => void;
}

export function useArenaRoster(currentElo: number): UseArenaRosterResult {
  const [competitors, setCompetitors] = React.useState<ArenaCompetitor[]>([]);
  const [challengedIds, setChallengedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  // Re-read after every match: the Arena stays mounted under the match
  // (jits-tlk3), and the match just changed both ELOs (so every eloDiff) and
  // consumed the challenge that marked the opponent "pending". A background
  // read, so no pull spinner.
  const matchExits = useMatchExitCount();

  const refresh = React.useCallback(() => {
    setIsRefreshing(true);
    setTick((t) => t + 1);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      // `getArenaData` logs the PostgREST error and returns the raw payload,
      // which is `null` when the read failed (jits-icei.5). So a null here
      // does NOT mean "nobody is looking", it means "we do not know", and
      // rendering it as an empty lobby would be the list lying about its
      // contents. Failed read and empty roster are different states.
      const arena = (await getArenaData(
        supabase,
        ARENA_ROSTER_LIMIT,
      )) as ArenaData | null;

      if (cancelled) return;

      if (!arena || !Array.isArray(arena.looking_athletes)) {
        setHasError(true);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setCompetitors(
        arena.looking_athletes.map((a) => ({
          id: a.id,
          displayName: a.display_name,
          currentElo: a.current_elo,
          gymName: a.gym_name ?? undefined,
          weight: a.current_weight ?? undefined,
          profilePhotoUrl: a.profile_photo_url,
          eloDiff: 0,
          acceptsRanked: a.looking_for_ranked === true,
        })),
      );
      setChallengedIds(new Set(arena.challenged_opponent_ids ?? []));
      setHasError(false);
      setIsLoading(false);
      setIsRefreshing(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tick, matchExits]);

  // The gap is taken against the athlete's CURRENT rating at render, not the
  // one at load: after a match both sides move, and the athlete's own row is
  // re-read (ArenaBootstrap) independently of this roster read.
  const withGap = React.useMemo(
    () => competitors.map((c) => ({ ...c, eloDiff: c.currentElo - currentElo })),
    [competitors, currentElo],
  );

  return {
    competitors: withGap,
    challengedIds,
    isLoading,
    isRefreshing,
    hasError,
    refresh,
  };
}

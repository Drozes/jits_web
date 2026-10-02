import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useReduceMotion } from "@/lib/motion";
import type { RankedAthlete } from "./use-leaderboard-data";

/**
 * Rank-up swap flare (Motion Rule registry, Moment tier): the first time
 * Rankings shows the athlete a better rank than the one they last saw, the
 * list renders the OLD order, then swaps to the new one with a layout
 * transition while a Signal Red flare sweeps the athlete's row. Once per
 * climb: the new rank is stored the moment the climb is detected, so a
 * remount, refetch or reopen with the same rank never replays it.
 *
 * Last-seen rank is per device and per athlete (AsyncStorage, like the Film
 * Room seen set): "the rank I last saw on this phone" needs no backend column.
 */
export const RANK_STORAGE_PREFIX = "rankings:last-seen-rank:v1:";

/** How long the old order holds (the first-load stagger lands first), ms. */
export const RANK_SWAP_DELAY_MS = 1140;
/** The swap's layout transition, ms. */
export const RANK_SWAP_MS = 450;
/** The flare's sweep across the row, ms. */
export const RANK_FLARE_MS = 500;

export type RankClimbStage = "old" | "swapped";

export interface RankClimb {
  from: number;
  to: number;
  stage: RankClimbStage;
}

export interface RankClimbState {
  /** False until the last-seen rank has been read; hold the list until then so it never jumps. */
  ready: boolean;
  /** The climb being shown, or null. */
  climb: RankClimb | null;
}

/**
 * Tracks the athlete's last-seen rank and reports a climb to animate.
 * `currentRank` is null while the athlete is not in the ranked list (the
 * stored rank is then left alone).
 */
export function useRankClimb(
  athleteId: string | undefined,
  currentRank: number | null,
): RankClimbState {
  const reduceMotion = useReduceMotion();
  // undefined: not read yet; null: nothing stored.
  const [stored, setStored] = React.useState<{ id: string; rank: number | null } | undefined>(
    undefined,
  );
  const [climb, setClimb] = React.useState<RankClimb | null>(null);

  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      let rank: number | null = null;
      try {
        const raw = await AsyncStorage.getItem(RANK_STORAGE_PREFIX + athleteId);
        const n = raw == null ? NaN : Number(raw);
        rank = Number.isInteger(n) && n > 0 ? n : null;
      } catch {
        // Unreadable storage: treat as never seen (no flare, which is harmless).
      }
      if (!cancelled) setStored({ id: athleteId, rank });
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const known = stored !== undefined && stored.id === athleteId ? stored.rank : undefined;

  // Derived during render, so the very render that first shows the better
  // rank already shows the OLD order (no new-old-new jump).
  const pending =
    !reduceMotion &&
    climb === null &&
    typeof known === "number" &&
    currentRank != null &&
    currentRank < known
      ? { from: known, to: currentRank, stage: "old" as const }
      : null;

  React.useEffect(() => {
    if (!athleteId || known === undefined || currentRank == null) return;
    if (currentRank === known) return;
    void AsyncStorage.setItem(RANK_STORAGE_PREFIX + athleteId, String(currentRank)).catch(
      () => undefined,
    );
    if (pending) setClimb(pending);
    setStored({ id: athleteId, rank: currentRank });
    // `pending` is derived from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, known, currentRank]);

  const stage = climb?.stage;
  React.useEffect(() => {
    if (stage === "old") {
      const t = setTimeout(
        () => setClimb((c) => (c ? { ...c, stage: "swapped" } : c)),
        RANK_SWAP_DELAY_MS,
      );
      return () => clearTimeout(t);
    }
    if (stage === "swapped") {
      // The swap lands, then the flare sweeps; clear once both are done.
      const t = setTimeout(() => setClimb(null), RANK_SWAP_MS + RANK_FLARE_MS + 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [stage]);

  return {
    ready: !athleteId || known !== undefined,
    climb: climb ?? pending,
  };
}

/**
 * The list as it stood before the climb: the athlete back at `from`, and the
 * athletes they passed (new ranks `to + 1 .. from`) one place higher. Works
 * on a filtered list: the athlete is placed after every row whose old rank
 * is still above theirs.
 */
export function orderBeforeClimb(
  athletes: RankedAthlete[],
  climb: Pick<RankClimb, "from" | "to">,
): RankedAthlete[] {
  const me = athletes.find((a) => a.isCurrentUser);
  if (!me) return athletes.map((a) => withOldRank(a, climb));
  const others = athletes.filter((a) => !a.isCurrentUser).map((a) => withOldRank(a, climb));
  const at = others.filter((a) => a.rank < climb.from).length;
  return [...others.slice(0, at), { ...me, rank: climb.from }, ...others.slice(at)];
}

function withOldRank(a: RankedAthlete, climb: Pick<RankClimb, "from" | "to">): RankedAthlete {
  if (a.isCurrentUser) return { ...a, rank: climb.from };
  if (a.rank > climb.to && a.rank <= climb.from) return { ...a, rank: a.rank - 1 };
  return a;
}

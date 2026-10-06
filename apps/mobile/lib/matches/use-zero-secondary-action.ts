import { useInvitesFlagState } from "@/lib/invites/use-invites-enabled";
import { shouldOfferPracticeMatch } from "@/lib/practice/constants";
import { useHasEverPlayed } from "@/lib/practice/use-has-ever-played";
import { useMyActiveMatch } from "@/lib/match-flow/use-my-active-match";
import { useMatchExitCount } from "@/lib/arena/arena-store";

/**
 * The Matches zero state's secondary action (specs/matches-tab 10.2, R2-5):
 * - `invite`: C-Z7 Challenge a friend, while `invites_enabled` is on;
 * - `practice`: C-Z5 Try a practice match, while the flag is off and the
 *   athlete is still offered the practice match (`shouldOfferPracticeMatch`);
 * - `pending`: the flag is not read yet (the slot keeps its height, empty, so
 *   nothing flashes from practice to invite);
 * - `none`: flag off and no practice offer.
 * Never both.
 */
export type ZeroSecondaryAction = "invite" | "practice" | "pending" | "none";

export interface ZeroAthlete {
  id: string;
  is_bot: boolean;
  practice_match_offered_at: string | null;
  practice_match_completed_at?: string | null;
}

/** Mounted only by the zero state, so its reads run only for a brand new athlete. */
export function useZeroSecondaryAction(athlete: ZeroAthlete): ZeroSecondaryAction {
  const invites = useInvitesFlagState();
  const { match: activeMatch } = useMyActiveMatch(athlete.id);
  const hasEverPlayed = useHasEverPlayed(athlete.id, useMatchExitCount());
  if (!invites.known) return "pending";
  if (invites.enabled) return "invite";
  // The library just read zero matches, so the stats are known and empty.
  const practice = shouldOfferPracticeMatch({
    athlete,
    hasActiveMatch: !!activeMatch,
    statsLoaded: true,
    hasMatches: false,
    hasEverPlayed,
  });
  return practice ? "practice" : "none";
}

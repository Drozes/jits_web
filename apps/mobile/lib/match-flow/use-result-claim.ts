import * as React from "react";

/** The claimer repeats its claim this often while it is on the form. */
export const CLAIM_HEARTBEAT_MS = 5_000;
/** A claim not heard from for this long unlocks the other side's form. */
export const CLAIM_STALE_MS = 20_000;

export interface Claim {
  athleteId: string;
  /** The claimer's epoch ms when it claimed; only breaks a tie. */
  at: number;
}

/**
 * Which of two simultaneous claims stands: the earlier one, and on an exact
 * tie the lower athlete id. Both phones compare the same two values, so they
 * agree without another round trip.
 */
export function winningClaim(a: Claim, b: Claim): Claim {
  if (a.at !== b.at) return a.at < b.at ? a : b;
  return a.athleteId < b.athleteId ? a : b;
}

export type ClaimState = "open" | "mine" | "theirs";

interface UseResultClaimParams {
  meId: string;
  /** Sends `result_claimed`; a no-op when the channel is down. */
  broadcast: (athleteId: string, claimedAt: number) => unknown;
}

/**
 * Claim-first result entry. The first athlete to start entering the result
 * claims it and the other phone shows a waiting view instead of a second
 * form. Advisory only: `record_match_result` accepts one result whatever
 * happens here, and a result that lands from either side moves both phones
 * on (broadcast or the reconciler). A claimer that goes quiet (app killed,
 * signal lost) for CLAIM_STALE_MS unlocks the form again.
 */
export function useResultClaim({ meId, broadcast }: UseResultClaimParams) {
  const [claim, setClaim] = React.useState<Claim | null>(null);
  const claimRef = React.useRef(claim);
  claimRef.current = claim;
  const heardAtRef = React.useRef(0);
  const broadcastRef = React.useRef(broadcast);
  broadcastRef.current = broadcast;

  const state: ClaimState = !claim ? "open" : claim.athleteId === meId ? "mine" : "theirs";

  /** Claim the form. False when the opponent already holds it. */
  const claimNow = React.useCallback((): boolean => {
    const current = claimRef.current;
    if (current && current.athleteId !== meId) return false;
    if (current) return true;
    const mine = { athleteId: meId, at: Date.now() };
    claimRef.current = mine;
    setClaim(mine);
    void broadcastRef.current(meId, mine.at);
    return true;
  }, [meId]);

  const onRemoteClaim = React.useCallback(
    (athleteId: string, at: number) => {
      if (athleteId === meId) return;
      heardAtRef.current = Date.now();
      const theirs = { athleteId, at };
      const current = claimRef.current;
      if (current && current.athleteId === meId) {
        const winner = winningClaim(current, theirs);
        if (winner === current) {
          // Mine stands: say so now rather than at the next heartbeat.
          void broadcastRef.current(meId, current.at);
          return;
        }
      }
      claimRef.current = theirs;
      setClaim(theirs);
    },
    [meId],
  );

  // Heartbeat while holding the claim.
  React.useEffect(() => {
    if (state !== "mine" || !claim) return;
    const at = claim.at;
    const id = setInterval(() => void broadcastRef.current(meId, at), CLAIM_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [state, claim, meId]);

  // Unlock when the opponent's claim goes quiet.
  React.useEffect(() => {
    if (state !== "theirs") return;
    const id = setInterval(() => {
      if (Date.now() - heardAtRef.current > CLAIM_STALE_MS) {
        claimRef.current = null;
        setClaim(null);
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [state]);

  return { state, claimerId: claim?.athleteId ?? null, claimNow, onRemoteClaim };
}

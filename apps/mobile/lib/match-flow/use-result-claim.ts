import * as React from "react";

/** The claimer repeats its claim this often while it is on the form. */
export const CLAIM_HEARTBEAT_MS = 5_000;
/** A claim not heard from for this long unlocks the other side's form. */
export const CLAIM_STALE_MS = 20_000;
/** A claim still alive but with no result after this long may be taken over. */
export const CLAIM_TAKEOVER_MS = 60_000;

export interface Claim {
  athleteId: string;
  /** The claimer's epoch ms when it claimed; only breaks a tie. */
  at: number;
  /** A takeover: the `at` of the claim it replaces. */
  supersedes?: number | null;
}

/**
 * Which of two simultaneous claims stands: the earlier one, and on an exact
 * tie the lower athlete id. Both phones compare the same two values, so they
 * agree without another round trip. (A takeover is not a tie: it names the
 * claim it replaces, see `onRemoteClaim`.)
 */
export function winningClaim(a: Claim, b: Claim): Claim {
  if (a.at !== b.at) return a.at < b.at ? a : b;
  return a.athleteId < b.athleteId ? a : b;
}

export type ClaimState = "open" | "mine" | "theirs";

interface UseResultClaimParams {
  meId: string;
  /** Sends `result_claimed`; a no-op when the channel is down. */
  broadcast: (athleteId: string, claimedAt: number, supersedes?: number | null) => unknown;
}

/**
 * Claim-first result entry. The first athlete to start entering the result
 * claims it and the other phone shows a waiting view instead of a second
 * form. Advisory only: `record_match_result` accepts one result whatever
 * happens here, and a result that lands from either side moves both phones
 * on (broadcast or the reconciler).
 *
 * Two ways out of a claim that never produces a result:
 *  - the claimer goes quiet (app killed, signal lost) for CLAIM_STALE_MS:
 *    the form unlocks;
 *  - the claimer is still there but has not recorded for CLAIM_TAKEOVER_MS:
 *    the waiting athlete may take over. The takeover names the claim it
 *    replaces (`supersedes`), and the replaced claimer yields to it; any
 *    other simultaneous claim still resolves by `winningClaim`.
 */
export function useResultClaim({ meId, broadcast }: UseResultClaimParams) {
  const [claim, setClaim] = React.useState<Claim | null>(null);
  const [canTakeOver, setCanTakeOver] = React.useState(false);
  const claimRef = React.useRef(claim);
  claimRef.current = claim;
  const heardAtRef = React.useRef(0);
  /** When the current claim of theirs was first seen (resets per claim). */
  const theirsSinceRef = React.useRef(0);
  const broadcastRef = React.useRef(broadcast);
  broadcastRef.current = broadcast;

  const state: ClaimState = !claim ? "open" : claim.athleteId === meId ? "mine" : "theirs";

  const take = React.useCallback((next: Claim) => {
    claimRef.current = next;
    setClaim(next);
    setCanTakeOver(false);
  }, []);

  /** Claim the form. False when the opponent already holds it. */
  const claimNow = React.useCallback((): boolean => {
    const current = claimRef.current;
    if (current && current.athleteId !== meId) return false;
    if (current) return true;
    const mine = { athleteId: meId, at: Date.now() };
    take(mine);
    void broadcastRef.current(meId, mine.at);
    return true;
  }, [meId, take]);

  /** Take over a claim that has gone a minute without a result. */
  const takeOver = React.useCallback(() => {
    const current = claimRef.current;
    if (!current || current.athleteId === meId) return;
    const mine = { athleteId: meId, at: Date.now(), supersedes: current.at };
    take(mine);
    void broadcastRef.current(meId, mine.at, current.at);
  }, [meId, take]);

  const onRemoteClaim = React.useCallback(
    (athleteId: string, at: number, supersedes: number | null = null) => {
      if (athleteId === meId) return;
      heardAtRef.current = Date.now();
      const theirs: Claim = { athleteId, at, supersedes };
      const current = claimRef.current;
      if (current && current.athleteId === meId) {
        // Their takeover of MY claim: yield.
        const takesMine = supersedes != null && supersedes === current.at;
        // A late heartbeat of the claim MY takeover replaced: mine stands.
        const replacedByMine = current.supersedes != null && current.supersedes === at;
        if (!takesMine && (replacedByMine || winningClaim(current, theirs) === current)) {
          // Mine stands: say so now rather than at the next heartbeat.
          void broadcastRef.current(meId, current.at, current.supersedes ?? null);
          return;
        }
      }
      if (!current || current.athleteId !== athleteId || current.at !== at) {
        theirsSinceRef.current = Date.now();
        take(theirs);
      }
    },
    [meId, take],
  );

  // Heartbeat while holding the claim.
  React.useEffect(() => {
    if (state !== "mine" || !claim) return;
    const { at, supersedes } = claim;
    const id = setInterval(() => void broadcastRef.current(meId, at, supersedes ?? null), CLAIM_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [state, claim, meId]);

  // Unlock when the opponent's claim goes quiet; offer a takeover when it
  // stays alive for a minute without a result.
  React.useEffect(() => {
    if (state !== "theirs") return;
    const id = setInterval(() => {
      const now = Date.now();
      if (now - heardAtRef.current > CLAIM_STALE_MS) {
        claimRef.current = null;
        setClaim(null);
        setCanTakeOver(false);
        return;
      }
      if (now - theirsSinceRef.current >= CLAIM_TAKEOVER_MS) setCanTakeOver(true);
    }, 1_000);
    return () => clearInterval(id);
  }, [state]);

  return { state, claimerId: claim?.athleteId ?? null, claimNow, onRemoteClaim, canTakeOver, takeOver };
}

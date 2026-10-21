import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { startMatchAsTimekeeper, type TimekeeperStartBlocker } from "@jits/shared/api/timekeeper";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SHIPPED_COPY } from "./timekeeper-copy";
import { SEND_GRACE_MS, useMatchSyncContext } from "./match-sync-context";

/**
 * Why the timekeeper's Start is disabled: a copy deck id (TK-K7 `WAITING FOR
 * BOTH ATHLETES`, TK-K8 `CONFIRM BOTH WEIGHTS`, TK-K10 `WAITING FOR YOUR
 * CAMERA`) or the shipped weight hold (`MATCH ON HOLD · WEIGHT CHECK`).
 */
export type StartBlockedReason = "TK-K7" | "TK-K8" | "TK-K10" | "hold";

export interface StartGate {
  canStart: boolean;
  /** The first blocker's reason; null once Start is enabled. */
  reason: StartBlockedReason | null;
}

/**
 * The timekeeper's camera, the one Start condition the server cannot see
 * (D12): `ready` with camera permission and AI processing consent (the
 * camera is up), `denied` once the OS will not ask again (TK-K11, TK-K12),
 * else `waiting`.
 */
export type CameraGate = "ready" | "waiting" | "denied";

export function cameraGateOf(
  permission: { granted: boolean; canAskAgain?: boolean } | null,
  consented: boolean,
): CameraGate {
  if (permission && !permission.granted && permission.canAskAgain === false) return "denied";
  return permission?.granted && consented ? "ready" : "waiting";
}

/**
 * The reason a server blocker shows (`get_timekeeper_match_state`
 * `start_blockers`, which is `_tk_start_blockers`, the list `start_match`
 * refuses with the first of). The weight HINTs name both the athletes'
 * checks and the timekeeper's: TK-K8 when the timekeeper still owes a
 * verdict, else the athletes are still on it (TK-K7).
 */
export function reasonForBlocker(blocker: TimekeeperStartBlocker, timekeeperOwesVerdict: boolean): StartBlockedReason {
  switch (blocker) {
    case "weight_flagged":
      return "hold";
    case "weight_recheck_pending":
    case "weight_check_pending":
      return timekeeperOwesVerdict ? "TK-K8" : "TK-K7";
    case "timekeeper_not_recording":
      return "TK-K10";
    case "timekeeper_required":
    case "athletes_not_ready":
    case "other":
      return "TK-K7";
  }
}

/**
 * Start's gate, in the server's order (spec R13; jr_be 024 3.6): the first
 * of the state's `start_blockers` decides the reason, exactly as `start_match`
 * would refuse; only with none left does the client's own camera gate apply
 * (it sits where the server's last blocker, the recording intent, does).
 * Before the first state read Start waits (TK-K7).
 */
export function deriveStartGate(p: {
  blockers: readonly TimekeeperStartBlocker[] | null;
  timekeeperOwesVerdict: boolean;
  camera: CameraGate;
}): StartGate {
  if (p.blockers == null) return { canStart: false, reason: "TK-K7" };
  const first = p.blockers[0];
  if (first) return { canStart: false, reason: reasonForBlocker(first, p.timekeeperOwesVerdict) };
  if (p.camera !== "ready") return { canStart: false, reason: "TK-K10" };
  return { canStart: true, reason: null };
}

/**
 * The face-off's guard between the timekeeper's Start and their Leave
 * (`useFaceoff`'s `timekeeperStart`; A5, R21). A Start claims it first and
 * is refused while a Leave is in flight; from the claim on, Leave is gone,
 * and it stays gone once the Start went through: a Leave racing a committed
 * Start would make the match a `timekeeper_left` no contest.
 */
export interface StartClaim {
  /** True: this Start may go ahead (Leave hides). False: a Leave is in flight, or a Start already went through. */
  claim: () => boolean;
  /** The Start ended: `started` keeps Leave gone; otherwise Leave is back. */
  release: (started: boolean) => void;
}

/**
 * The face-off's `StartClaim` (`useFaceoff`, `timekeeperStart`) over its
 * Leave guards: `cancelledRef` is set while a Leave is in flight,
 * `startedRef` once a Start went through. `claimed` hides Leave.
 */
export function useStartClaim(
  startedRef: React.MutableRefObject<boolean>,
  cancelledRef: React.MutableRefObject<boolean>,
): { claim: StartClaim; claimed: boolean } {
  const [claimed, setClaimed] = React.useState(false);
  const claim = React.useMemo<StartClaim>(
    () => ({
      claim: () => {
        if (cancelledRef.current || startedRef.current) return false;
        setClaimed(true);
        return true;
      },
      release: (started) => {
        if (started) startedRef.current = true;
        else setClaimed(false);
      },
    }),
    [startedRef, cancelledRef],
  );
  return { claim, claimed };
}

interface TimekeeperStartParams {
  matchId: string;
  /** The seated timekeeper (this phone): the `timer_started` actor. */
  timekeeperId: string | null;
  gate: StartGate;
  /** The face-off's Start and Leave guard. */
  claim: StartClaim;
  /** The face-off channel's send (`useStepMatchSync`). */
  broadcastTimerStarted: (startedAt: string, actorId?: string | null) => Promise<unknown>;
}

/**
 * The timekeeper's Start (spec 4.2 Start, R13; TK-K6). One tap, one
 * `start_match` (its timekeeper branch): never called by an effect, never
 * retried (A29: a failed Start says the shipped `Couldn't start match` once,
 * re-reads the match and waits for another tap; the reason line follows the
 * timekeeper-mode state, on its realtime rows or its next poll). On success
 * it sends `timer_started` with this phone as the actor (a hint: the
 * athletes re-read, M-R8) and re-reads the match, so the wizard's reconciler
 * moves all three phones to live on the DB's status; Start stays busy until
 * then. Never while a Leave is in flight (`claim`).
 */
export function useTimekeeperStart(p: TimekeeperStartParams): { starting: boolean; start: () => void } {
  const { reconcileNow } = useMatchSyncContext();
  const [starting, setStarting] = React.useState(false);
  const inFlightRef = React.useRef(false);
  const pRef = React.useRef(p);
  pRef.current = p;
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const start = React.useCallback(() => {
    const s = pRef.current;
    if (inFlightRef.current || !s.gate.canStart || !s.claim.claim()) return;
    inFlightRef.current = true;
    setStarting(true);
    void (async () => {
      const res = await startMatchAsTimekeeper(supabase, s.matchId);
      if (!mountedRef.current) return;
      if (!res.ok) {
        inFlightRef.current = false;
        setStarting(false);
        s.claim.release(false);
        toast.error({ text1: SHIPPED_COPY.couldNotStart });
        reconcileNow();
        return;
      }
      s.claim.release(true);
      await settleWithin(s.broadcastTimerStarted(res.data.startedAt, s.timekeeperId), SEND_GRACE_MS);
      if (mountedRef.current) reconcileNow();
    })();
  }, [reconcileNow]);

  return { starting, start };
}

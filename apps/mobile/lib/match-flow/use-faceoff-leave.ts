import * as React from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { cancelSessionMatch } from "@jits/shared/api/mutations";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { exitMatchTo } from "./exit-to";
import { SEND_GRACE_MS, useMatchSyncContext } from "./match-sync-context";
import type { MatchRoles } from "./match-roles";
import { athleteLeaveAlert, leaveSeat, prestartLeaveAlert, UNSEATED_TOAST } from "./timekeeper-actions";
import { PRESS_COPY } from "./press-copy";

/** The names a timekeeper-mode Leave alert gives (`MatchRoles` satisfies it). */
type LeaveRoles = Pick<MatchRoles, "opponent" | "athletes" | "timekeeper">;

interface FaceoffLeaveBase {
  matchId: string;
  /** Where the wizard's exits go. */
  exitHref: string;
  /** Leave is gone once the match started. */
  startedRef: React.MutableRefObject<boolean>;
  /** Set here while the cancel (or the timekeeper's leave) is in flight; the start never runs then. */
  cancelledRef: React.MutableRefObject<boolean>;
  broadcastMatchCancelled: () => Promise<unknown>;
}

/**
 * What this viewer's Leave does (`roles.caps.leave`, timekeeper mode
 * ARCHITECTURE 2.3 "Leave"; spec 4.3) and the names its alert gives (`roles`):
 *  - no policy (the default, today's callers): the shipped cancel for all
 *    and the shipped alert;
 *  - "cancel_for_all": an athlete cancels the match for everyone, as today.
 *    The alert is the shipped one, or TK-E4 naming the opponent once a
 *    timekeeper is seated (`roles.timekeeper`; while the athletes still pick,
 *    the shipped body stays, review round 6 n2);
 *  - "timekeeper_seat": the seated timekeeper leaves the seat before the
 *    start (A5; TK-K14 names both athletes): the athletes go back to the
 *    picker and this phone exits with TK-K17;
 *  - "none": no Leave.
 * A caller that passes `leave` passes `roles` too (M3's `use-faceoff.ts`
 * passes `roles.caps.leave` and `roles`): `leave` alone would silently keep
 * the shipped alert instead of TK-E4.
 */
type LeavePolicy =
  | { leave?: undefined; roles?: undefined }
  | { leave: "cancel_for_all" | "timekeeper_seat" | "none"; roles: LeaveRoles };

export type FaceoffLeaveParams = FaceoffLeaveBase & LeavePolicy;

/** The shipped face-off Leave alert (flag OFF, and an athlete while nobody is seated). */
const SHIPPED_ALERT = {
  title: "Cancel match?",
  body: "Your opponent will be returned to the lobby.",
  cancel: "Keep Waiting",
  confirm: "Cancel Match",
};

function leaveAlert(p: LeavePolicy): typeof SHIPPED_ALERT {
  if (p.leave === "timekeeper_seat") {
    const [a, b] = p.roles.athletes;
    return prestartLeaveAlert({ a: a.shortName, b: b.shortName });
  }
  const opponent = p.roles?.timekeeper ? p.roles.opponent : null;
  return opponent ? athleteLeaveAlert(opponent.shortName) : SHIPPED_ALERT;
}

/**
 * The face-off's Leave (timekeeper mode ARCHITECTURE 2.3, "Leave"): confirm,
 * then act on the policy above and exit through `exitMatchTo`. An athlete's
 * cancel tells the other phones and exits; a failed cancel re-arms Leave
 * with the shipped toast, which in a timekeeper-mode match (the crew step,
 * the face-off; the sync context's `timekeeperModeSelfId`) is its title (with
 * `Check your connection and try again.`, PM29, unless the match already
 * started) and a re-read, never the server's text (M-R4, spec 14.9 X1). The
 * timekeeper's leave exits with TK-K17; when the server refuses it (the
 * match moved on: started, cancelled, the seat already gone) or it fails, it
 * re-arms and re-reads, so the DB moves the screen. Split out of
 * `use-faceoff.ts`.
 */
export function useFaceoffLeave(p: FaceoffLeaveParams): { cancelling: boolean; leave: () => void } {
  const router = useRouter();
  const { markExiting, reconcileNow, timekeeperModeSelfId } = useMatchSyncContext();
  const timekeeperMode = timekeeperModeSelfId != null;
  const [cancelling, setCancelling] = React.useState(false);
  const pRef = React.useRef(p);
  pRef.current = p;
  const { startedRef, cancelledRef, broadcastMatchCancelled } = p;
  const policy = p.leave ?? "cancel_for_all";

  const doCancel = React.useCallback(async () => {
    if (cancelledRef.current || startedRef.current) return;
    cancelledRef.current = true;
    setCancelling(true);
    const result = await cancelSessionMatch(supabase, pRef.current.matchId);
    if (!result.ok) {
      cancelledRef.current = false;
      setCancelling(false);
      if (!timekeeperMode) {
        toast.error({ text1: "Could not cancel", description: result.error.message });
        return;
      }
      // The match moved on (MATCH_NOT_PENDING: the timekeeper started it): the
      // shipped title alone, which is true. Any other failure adds the
      // guidance (PM29). Either way the DB moves the screen.
      toast.error(
        result.error.code === "MATCH_NOT_PENDING"
          ? { text1: "Could not cancel" }
          : { text1: "Could not cancel", description: PRESS_COPY.checkConnection },
      );
      reconcileNow();
      return;
    }
    markExiting();
    await settleWithin(broadcastMatchCancelled(), SEND_GRACE_MS);
    exitMatchTo(router, pRef.current.exitHref);
  }, [startedRef, cancelledRef, broadcastMatchCancelled, markExiting, reconcileNow, router, timekeeperMode]);

  const doLeaveSeat = React.useCallback(async () => {
    if (cancelledRef.current || startedRef.current) return;
    cancelledRef.current = true;
    setCancelling(true);
    const outcome = await leaveSeat(pRef.current.matchId);
    if (outcome === "unseated") {
      markExiting();
      toast.info({ text1: UNSEATED_TOAST.title });
      exitMatchTo(router, pRef.current.exitHref);
      return;
    }
    // The clock was running after all: a no contest, which the wizard's exit
    // shows (TK-NC3). Leave stays off until it does.
    if (outcome === "no_contest") {
      reconcileNow();
      return;
    }
    cancelledRef.current = false;
    setCancelling(false);
    reconcileNow();
  }, [startedRef, cancelledRef, markExiting, reconcileNow, router]);

  const leave = React.useCallback(() => {
    if (policy === "none" || cancelledRef.current || startedRef.current) return;
    const a = leaveAlert(pRef.current);
    const act = policy === "timekeeper_seat" ? doLeaveSeat : doCancel;
    Alert.alert(a.title, a.body, [
      { text: a.cancel, style: "cancel" },
      { text: a.confirm, style: "destructive", onPress: () => void act() },
    ]);
  }, [policy, startedRef, cancelledRef, doCancel, doLeaveSeat]);

  return { cancelling, leave };
}

import * as React from "react";
import { Alert } from "react-native";
// From the protocol module, not the hook module: tests mock the hook module.
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SEND_GRACE_MS, useMatchSyncContext } from "./match-sync-context";
import { leaveSeat, LIVE_LEAVE_ALERT } from "./timekeeper-actions";

interface TimekeeperLiveLeaveParams {
  matchId: string;
  /** The live step's one-shot end guard; a no contest sets it, so nothing else runs after. */
  endedRef: React.MutableRefObject<boolean>;
  /** Another live control in flight (pause, resume, end): Leave waits, read at the tap and at the confirm. */
  busyRef: { readonly current: string | null };
  /** Marks the leave in flight, which disables the live controls, or clears it. */
  setLeaving: (leaving: boolean) => void;
  /** The step channel's cancel, which names this phone in timekeeper mode (`useStepMatchSync`). */
  broadcastMatchCancelled: () => Promise<unknown>;
  /** The match became a no contest: stop what the live step runs (the recorder). */
  onLeftSeat?: () => void;
}

/**
 * The timekeeper's Leave while the clock runs (A4; spec 4.3; slice M4),
 * split out of the shared `useLiveControls` so the two-athlete hook keeps
 * only the controls both modes have. After the TK-K16 alert,
 * `leave_match_as_timekeeper` makes the match a no contest at once. This
 * phone then stops its recorder, tells the athletes (`match_cancelled`, which
 * names this phone) and re-reads: the wizard's one exit leaves with TK-NC3
 * through `exitMatchTo`. A refusal (the clock ended meanwhile and the result
 * is owed) or a failure re-reads and keeps the screen (M-R8); no server text
 * is ever shown (M-R4).
 *
 * The confirm is dropped when the clock ended or another control started
 * while the alert was up (the auto-end at 00:00): the result is then owed,
 * which the server would refuse anyway.
 */
export function useTimekeeperLiveLeave({
  matchId,
  endedRef,
  busyRef,
  setLeaving,
  broadcastMatchCancelled,
  onLeftSeat,
}: TimekeeperLiveLeaveParams): () => void {
  const { reconcileNow } = useMatchSyncContext();
  const onLeftSeatRef = React.useRef(onLeftSeat);
  onLeftSeatRef.current = onLeftSeat;

  const leaveLive = React.useCallback(async () => {
    if (endedRef.current || busyRef.current) return;
    setLeaving(true);
    const outcome = await leaveSeat(matchId);
    if (outcome === "no_contest") {
      // The controls stay off (leaving) until the wizard exits.
      endedRef.current = true;
      onLeftSeatRef.current?.();
      await settleWithin(broadcastMatchCancelled(), SEND_GRACE_MS);
      reconcileNow();
      return;
    }
    setLeaving(false);
    reconcileNow();
  }, [broadcastMatchCancelled, busyRef, endedRef, matchId, reconcileNow, setLeaving]);

  return React.useCallback(() => {
    if (endedRef.current || busyRef.current) return;
    const a = LIVE_LEAVE_ALERT;
    Alert.alert(a.title, a.body, [
      { text: a.cancel, style: "cancel" },
      { text: a.confirm, style: "destructive", onPress: () => void leaveLive() },
    ]);
  }, [busyRef, endedRef, leaveLive]);
}

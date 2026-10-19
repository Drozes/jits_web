import * as React from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { cancelSessionMatch } from "@jits/shared/api/mutations";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { exitMatchTo } from "./exit-to";
import { SEND_GRACE_MS, useMatchSyncContext } from "./match-sync-context";

interface FaceoffLeaveParams {
  matchId: string;
  /** Where the wizard's exits go. */
  exitHref: string;
  /** Leave is gone once the match started. */
  startedRef: React.MutableRefObject<boolean>;
  /** Set here while the cancel is in flight; the start never runs then. */
  cancelledRef: React.MutableRefObject<boolean>;
  broadcastMatchCancelled: () => Promise<unknown>;
}

/**
 * The face-off's Leave (timekeeper mode ARCHITECTURE 2.3, "Leave"): confirm,
 * then cancel the match for both athletes, tell the other phone and exit
 * through `exitMatchTo`. A failed cancel re-arms Leave. Split out of
 * `use-faceoff.ts`.
 */
export function useFaceoffLeave(p: FaceoffLeaveParams): { cancelling: boolean; leave: () => void } {
  const router = useRouter();
  const { markExiting } = useMatchSyncContext();
  const [cancelling, setCancelling] = React.useState(false);
  const pRef = React.useRef(p);
  pRef.current = p;
  const { startedRef, cancelledRef, broadcastMatchCancelled } = p;

  const doCancel = React.useCallback(async () => {
    if (cancelledRef.current || startedRef.current) return;
    cancelledRef.current = true;
    setCancelling(true);
    const result = await cancelSessionMatch(supabase, pRef.current.matchId);
    if (!result.ok) {
      cancelledRef.current = false;
      setCancelling(false);
      toast.error({ text1: "Could not cancel", description: result.error.message });
      return;
    }
    markExiting();
    await settleWithin(broadcastMatchCancelled(), SEND_GRACE_MS);
    exitMatchTo(router, pRef.current.exitHref);
  }, [startedRef, cancelledRef, broadcastMatchCancelled, markExiting, router]);

  const leave = React.useCallback(() => {
    if (cancelledRef.current || startedRef.current) return;
    Alert.alert("Cancel match?", "Your opponent will be returned to the lobby.", [
      { text: "Keep Waiting", style: "cancel" },
      { text: "Cancel Match", style: "destructive", onPress: () => void doCancel() },
    ]);
  }, [startedRef, cancelledRef, doCancel]);

  return { cancelling, leave };
}

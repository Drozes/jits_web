import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { checkOpponentWeight, reweighForMatch, type WeightVerdict } from "@jits/shared/api/match-weight-checks";
import type { DomainError } from "@jits/shared/api/errors";
import type { WeightChecksHandle } from "./use-match-weight-checks";
import { useMatchSyncContext } from "./match-sync-context";
import { PRESS_COPY } from "./press-copy";

/** reweigh_for_match accepts 0 < w < 500 lbs (stored to 0.01). */
export function isValidReweigh(lbs: number): boolean {
  return Number.isFinite(lbs) && Math.round(lbs * 100) / 100 > 0 && Math.round(lbs * 100) / 100 < 500;
}

interface WeightCheckActionsParams {
  matchId: string;
  /** The opponent weight on screen: the one a confirm or flag judges. */
  opponentWeight: number | null;
  checks: WeightChecksHandle;
}

/**
 * The face-off's two weight-check actions (jr_be-ahn.4), split out of
 * `use-faceoff.ts`: judge the opponent's weigh-in and re-weigh for this
 * match. Each applies what the RPC returned, or re-reads the checks on a
 * refusal and says so with the shipped toast. In a timekeeper-mode match
 * (the sync context's `timekeeperModeSelfId`) that toast is its title,
 * never the server's text (M-R4, spec 14.9 X1), with `Check your connection
 * and try again.` under a failure the screen cannot explain (PM29;
 * `Weight changed` and a match that moved on, MATCH_NOT_PENDING, keep the
 * title alone, which is true), and the match is re-read too, since the
 * refusal may mean it moved on.
 */
export function useWeightCheckActions(params: WeightCheckActionsParams) {
  const [busy, setBusy] = React.useState(false);
  const pRef = React.useRef(params);
  pRef.current = params;
  const { reconcileNow, timekeeperModeSelfId } = useMatchSyncContext();
  const modeRef = React.useRef({ timekeeperMode: false, reconcileNow });
  modeRef.current = { timekeeperMode: timekeeperModeSelfId != null, reconcileNow };

  /**
   * The refusal's toast: the shipped title and the server's reason; in
   * timekeeper mode the title and a re-read. A failure adds the guidance
   * (PM29), except MATCH_NOT_PENDING (`invalid_status`: the match started or
   * was cancelled), which the re-read explains.
   */
  const refused = React.useCallback((kind: "error" | "info", title: string, error: DomainError) => {
    if (!modeRef.current.timekeeperMode) {
      toast[kind]({ text1: title, description: error.message });
      return;
    }
    const explained = kind === "info" || error.code === "MATCH_NOT_PENDING";
    toast[kind](explained ? { text1: title } : { text1: title, description: PRESS_COPY.checkConnection });
    modeRef.current.reconcileNow();
  }, []);

  const check = React.useCallback(async (verdict: WeightVerdict) => {
    const handle = pRef.current.checks;
    if (handle.status !== "ready") return;
    setBusy(true);
    // The opponent weight on screen is the one being judged.
    const seen = verdict === "withdraw" ? undefined : pRef.current.opponentWeight;
    const res = await checkOpponentWeight(supabase, pRef.current.matchId, verdict, seen);
    setBusy(false);
    if (res.ok) {
      handle.apply(res.data);
      return;
    }
    handle.refetch();
    if (res.error.code === "WEIGHT_CHANGED") {
      refused("info", "Weight changed", res.error);
      return;
    }
    refused("error", "Couldn't save your check", res.error);
  }, [refused]);

  const reweigh = React.useCallback(async (lbs: number) => {
    const handle = pRef.current.checks;
    if (!isValidReweigh(lbs)) {
      toast.error({ text1: "Couldn't re-weigh", description: "Enter a weight between 0 and 500 lbs." });
      return false;
    }
    setBusy(true);
    const res = await reweighForMatch(supabase, pRef.current.matchId, Math.round(lbs * 100) / 100);
    setBusy(false);
    if (res.ok) {
      handle.apply(res.data);
      return true;
    }
    handle.refetch();
    refused("error", "Couldn't re-weigh", res.error);
    return false;
  }, [refused]);

  return { busy, check, reweigh };
}

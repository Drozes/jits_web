import * as React from "react";
import { useRouter } from "expo-router";
import { toast } from "@/components/ui/toast";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { planReconcile, resultFromOutcome } from "./reconcile";
import { getCurrentStep, MATCH_STEPS, type MatchStep } from "./step-router";
import { useMatchReconciler, type ReconcileSnapshot } from "./use-match-reconciler";

interface UseWizardSyncParams {
  matchId: string;
  currentAthleteId: string;
  exitHref: string;
  match: MatchDetails | null;
  /** The wizard can reconcile only once the match is loaded and this
   * athlete is one of its participants. */
  ready: boolean;
  applyMatch: (m: MatchDetails) => void;
  refresh: () => void;
}

/**
 * The wizard's step state plus everything that keeps it in sync with the
 * DB. Owns `step`, `startedAt`, `resultData` and the DB's confirmations, and
 * wires `useMatchReconciler` to them:
 *
 *  - steps move the wizard with `setStep`, which is monotonic (a late
 *    callback from a step that has already been left can never move it
 *    back);
 *  - every reconciler snapshot is applied to the match in hand and fed to
 *    `planReconcile`, which may only move forward (or exit a cancelled
 *    match), with one initial summary -> confirm correction;
 *  - leaving the live step this way stops the recorder first, in the same
 *    tick, exactly like a received `match_ended` does, so the camera never
 *    unmounts under a running recording.
 */
export function useWizardSync({
  matchId,
  currentAthleteId,
  exitHref,
  match,
  ready,
  applyMatch,
  refresh,
}: UseWizardSyncParams) {
  const router = useRouter();
  const [step, setStepState] = React.useState<MatchStep | null>(null);
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
  const [resultData, setResultData] = React.useState<BroadcastResult | null>(null);
  const [confirmedAthleteIds, setConfirmedAthleteIds] = React.useState<string[]>([]);
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const interactedRef = React.useRef(false);
  const firstSnapshotRef = React.useRef(true);
  const exitingRef = React.useRef(false);
  /** Set by a component inside the recorder provider (the wizard renders
   * the provider below this hook). */
  const stopRecorderRef = React.useRef<(() => void) | null>(null);

  // Mount-time step from status alone; the first snapshot may refine it.
  React.useEffect(() => {
    if (!match) return;
    setStepState((prev) => prev ?? getCurrentStep(match));
    setStartedAt((prev) => prev ?? match.started_at);
  }, [match]);

  const setStep = React.useCallback((next: MatchStep) => {
    interactedRef.current = true;
    setStepState((prev) =>
      prev && MATCH_STEPS.indexOf(next) < MATCH_STEPS.indexOf(prev) ? prev : next,
    );
  }, []);

  /** The wizard's one exit for a match that ended without a result (remote
   * cancel, or a DB snapshot that is cancelled or voided). Idempotent: it
   * marks the wizard exiting, so a second trigger neither toasts nor
   * navigates again. */
  const exitCancelled = React.useCallback(
    (description = "This match was cancelled.", title = "Match cancelled") => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      toast.info({ text1: title, description });
      router.replace(exitHref);
    },
    [router, exitHref],
  );

  const markExiting = React.useCallback(() => {
    exitingRef.current = true;
  }, []);

  const onSnapshot = React.useCallback(
    ({ match: fresh, confirmedAthleteIds: ids }: ReconcileSnapshot) => {
      applyMatch(fresh);
      if (ids) setConfirmedAthleteIds(ids);
      const current = stepRef.current;
      const me = fresh.participants.find((p) => p.athlete_id === currentAthleteId);
      const opponent = fresh.participants.find((p) => p.athlete_id !== currentAthleteId);
      if (!current || !me || !opponent || exitingRef.current) return;

      const initial = firstSnapshotRef.current && !interactedRef.current;
      firstSnapshotRef.current = false;
      const action = planReconcile({
        current,
        snapshot: { status: fresh.status, confirmedAthleteIds: ids },
        currentAthleteId,
        opponentId: opponent.athlete_id,
        initial,
      });
      if (action.type === "exit") {
        if (action.reason === "voided") {
          exitCancelled(
            "This result was voided on review. Any rating change was reversed.",
            "Match voided",
          );
        } else {
          exitCancelled();
        }
        return;
      }
      if (action.type !== "goto") return;

      if (current === "live") stopRecorderRef.current?.();
      if (action.step === "live" && fresh.started_at) setStartedAt(fresh.started_at);
      if (action.step === "confirm" || action.step === "summary") {
        const rebuilt = resultFromOutcome(me.outcome, currentAthleteId, opponent.athlete_id);
        setResultData((prev) => prev ?? rebuilt);
      }
      // Summary reads the stamped ELO; take the same refresh path the
      // confirm step's own completion takes.
      if (action.step === "summary") refresh();
      // planReconcile already guaranteed the direction, including the one
      // allowed initial correction, so this bypasses the monotonic setter.
      setStepState(action.step);
    },
    [applyMatch, currentAthleteId, exitCancelled, refresh],
  );

  const { reconcileNow, onChannelStatus } = useMatchReconciler({
    matchId,
    step,
    enabled: ready,
    onSnapshot,
  });

  const syncContext = React.useMemo(
    () => ({ onChannelStatus, reconcileNow, markExiting }),
    [onChannelStatus, reconcileNow, markExiting],
  );

  return {
    step,
    setStep,
    startedAt,
    setStartedAt,
    resultData,
    setResultData,
    confirmedAthleteIds,
    exitCancelled,
    stopRecorderRef,
    syncContext,
  };
}

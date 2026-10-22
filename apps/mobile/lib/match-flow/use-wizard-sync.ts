import * as React from "react";
import { useRouter } from "expo-router";
import { exitMatchTo } from "./exit-to";
import { toast } from "@/components/ui/toast";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { deriveMatchRoles, type MatchRoles } from "./match-roles";
import { matchSnapshot, planReconcile, resultFromRoles, type MatchSnapshot } from "./reconcile";
import { getCurrentStep, MATCH_STEPS, type MatchStep } from "./step-router";
import { isAllowedBackward } from "./step-transitions";
import { useMatchReconciler, type ReconcileSnapshot } from "./use-match-reconciler";
import { timekeeperStatePollMs, useTimekeeperState } from "./use-timekeeper-state";
import { noContestExit, type NoContestExitReason } from "./no-contest-exit";

/**
 * TK-E1: how long the timekeeper's exit for an athlete's Leave waits for the
 * `match_cancelled` broadcast that names the athlete. The leaving athlete's
 * phone gives that send the same bound (`SEND_GRACE_MS` in
 * `match-sync-context.tsx`, not imported here: that module loads the
 * Supabase client).
 */
export const CANCEL_ACTOR_GRACE_MS = 1_500;

interface UseWizardSyncParams {
  matchId: string;
  /** The signed-in athlete; each snapshot's roles are derived for them. */
  currentAthleteId: string;
  exitHref: string;
  match: MatchDetails | null;
  /** The wizard can reconcile only once the match is loaded and this
   * viewer has a role in it (an athlete, or a timekeeper-mode timekeeper). */
  ready: boolean;
  applyMatch: (m: MatchDetails) => void;
  refresh: () => void;
}

/**
 * The wizard's step state plus everything that keeps it in sync with the
 * DB. Owns `step`, `startedAt`, `resultData`, the DB's confirmations and, in
 * timekeeper mode, the timekeeper-mode state, and wires `useMatchReconciler`
 * to them:
 *
 *  - steps move the wizard with `setStep`, which is monotonic (a late
 *    callback from a step that has already been left can never move it
 *    back) except for the two timekeeper-mode moves the last snapshot
 *    proves (`isAllowedBackward`, `step-transitions.ts`);
 *  - every reconciler snapshot is applied to the match in hand and fed to
 *    `planReconcile`, which may only move forward (or exit a cancelled
 *    match), with one initial summary -> confirm correction and the same two
 *    timekeeper-mode moves;
 *  - a timekeeper-mode match that leaves without a result exits through
 *    `noContestExit` (its reason-specific toast, naming the athlete a
 *    `match_cancelled` broadcast reported through `noteCancelActor`), and so
 *    does a timekeeper who lost the seat (TK-K17); every exit goes through
 *    `exitMatchTo`. The timekeeper's exit for an athlete's Leave waits up to
 *    `CANCEL_ACTOR_GRACE_MS` for that broadcast (`exitAfterActor`): the cancel
 *    commits before the athlete's phone sends it, so the row event or a poll
 *    can show the cancel first, and only the broadcast says which athlete
 *    left (TK-E1);
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

  // The viewer's roles in the match in hand (the wizard derives the same
  // ones for what it renders), and the last snapshot the reconciler applied:
  // together they are what a backward step must be proven by.
  const roles = React.useMemo(
    () => (match ? deriveMatchRoles(match, currentAthleteId) : null),
    [match, currentAthleteId],
  );
  const rolesRef = React.useRef<MatchRoles | null>(roles);
  rolesRef.current = roles;
  const matchRef = React.useRef(match);
  matchRef.current = match;
  const lastSnapshotRef = React.useRef<MatchSnapshot | null>(null);
  /**
   * A8: the result edit count the athlete's verdict stands on (the
   * snapshot's `summaryEditCount`). Fixed when the wizard enters `summary`,
   * to the freshest count known then, and cleared when it leaves; never
   * moved by a snapshot, so a read that cannot prove an edit's reset
   * (confirmations unknown, or read while the edit committed) does not use
   * the edit up. Timekeeper mode's confirm sends the count it confirms at and
   * the server refuses a stale one, so the count in hand on entering
   * `summary` is the one this athlete confirmed, provided the confirm step
   * does not complete once an edit has moved the count past the one it
   * confirmed at (M5's stale-confirm handling).
   */
  const summaryEditCountRef = React.useRef<number | undefined>(undefined);
  /** Track the A8 baseline across a step change (`prev` -> `next`). */
  const trackSummary = React.useCallback((prev: MatchStep | null, next: MatchStep) => {
    if (next !== "summary") summaryEditCountRef.current = undefined;
    else if (prev !== "summary") {
      // Counts only grow, so the larger of the last snapshot and the match in hand is the freshest.
      const fromSnapshot = lastSnapshotRef.current?.resultEditCount ?? 0;
      summaryEditCountRef.current = Math.max(fromSnapshot, matchRef.current?.result_edit_count ?? 0);
    }
  }, []);
  /** Timekeeper mode: who cancelled, when a `match_cancelled` broadcast named them (TK-E1). */
  const cancelActorRef = React.useRef<string | null>(null);
  /** The timekeeper's exit held for that name (`exitAfterActor`): run it now, or null. */
  const heldExitRef = React.useRef<(() => void) | null>(null);

  // Timekeeper mode only: the fast-changing state (ready, checks, request,
  // presence, timeouts, edit window, Start blockers). A two-athlete match
  // never reads it.
  const timekeeper = useTimekeeperState({
    matchId,
    enabled: ready && roles?.mode === "timekeeper",
    pollMs: timekeeperStatePollMs(step, roles?.viewer ?? null),
  });

  // Mount-time step from the match; the first snapshot may refine it.
  React.useEffect(() => {
    if (!match) return;
    setStepState((prev) => {
      if (prev) return prev;
      const mountStep = getCurrentStep(match, rolesRef.current, timekeeper.state);
      trackSummary(null, mountStep);
      return mountStep;
    });
    setStartedAt((prev) => prev ?? match.started_at);
  }, [match, timekeeper.state, trackSummary]);

  // Timekeeper mode: the state lands after the match, so its first read may
  // refine the mount step once, forward only and before the athlete moved
  // the wizard (an athlete the server already has ready reopens on `ready`).
  const refinedRef = React.useRef(false);
  React.useEffect(() => {
    if (refinedRef.current || !match || !timekeeper.state) return;
    refinedRef.current = true;
    if (interactedRef.current) return;
    const mountStep = getCurrentStep(match, rolesRef.current, timekeeper.state);
    setStepState((prev) => {
      if (!prev || MATCH_STEPS.indexOf(mountStep) <= MATCH_STEPS.indexOf(prev)) return prev;
      trackSummary(prev, mountStep);
      return mountStep;
    });
  }, [match, timekeeper.state, trackSummary]);

  const setStep = React.useCallback(
    (next: MatchStep) => {
      interactedRef.current = true;
      setStepState((prev) => {
        const snapshot = lastSnapshotRef.current;
        const r = rolesRef.current;
        const allowed =
          !prev ||
          MATCH_STEPS.indexOf(next) >= MATCH_STEPS.indexOf(prev) ||
          (snapshot != null &&
            r != null &&
            isAllowedBackward(prev, next, { ...snapshot, summaryEditCount: summaryEditCountRef.current }, r));
        if (!allowed) return prev;
        trackSummary(prev, next);
        return next;
      });
    },
    [trackSummary],
  );

  /** The wizard's one exit for a match that ended without a result (remote
   * cancel, or a DB snapshot that is cancelled or voided). Idempotent: it
   * marks the wizard exiting, so a second trigger neither toasts nor
   * navigates again. */
  const exitCancelled = React.useCallback(
    (description = "This match was cancelled.", title = "Match cancelled", pastGuard = false) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      toast.info({ text1: title, description });
      if (pastGuard) exitMatchTo(router, exitHref, { pastGuard });
      else exitMatchTo(router, exitHref);
    },
    [router, exitHref],
  );

  /**
   * A timekeeper-mode exit: its reason's toast (M4's `noContestExit`), else
   * the shipped one. It may come from the live step (the timekeeper left or
   * went offline, a pause timed out), so it goes past the match screen's
   * remove guard (`exitMatchTo`'s `pastGuard`).
   */
  const exitNoContest = React.useCallback(
    (reason: NoContestExitReason | null, r: MatchRoles) => {
      const exit = noContestExit({ reason, roles: r, actorId: cancelActorRef.current });
      exitCancelled(exit?.description, exit?.title, true);
    },
    [exitCancelled],
  );

  /**
   * TK-E1: the timekeeper cannot tell which athlete left from the cancelled
   * row, only from that athlete's `match_cancelled` broadcast, which is sent
   * once the cancel has committed. So an `athlete_left` exit on the
   * timekeeper's phone that does not know the athlete yet is held until the
   * broadcast names them (`noteCancelActor` runs it) or
   * `CANCEL_ACTOR_GRACE_MS` has passed (then it exits with no name). Held
   * once; every other exit, and an athlete's (whose opponent is the only
   * other athlete), is immediate.
   */
  const exitAfterActor = React.useCallback(
    (reason: NoContestExitReason | null, r: MatchRoles) => {
      if (reason !== "athlete_left" || r.viewer !== "timekeeper" || cancelActorRef.current) {
        exitNoContest(reason, r);
        return;
      }
      if (heldExitRef.current) return;
      const timer = setTimeout(() => heldExitRef.current?.(), CANCEL_ACTOR_GRACE_MS);
      heldExitRef.current = () => {
        clearTimeout(timer);
        heldExitRef.current = null;
        exitNoContest(reason, r);
      };
    },
    [exitNoContest],
  );
  // Unmounting with an exit held drops it (the screen is going anyway): its
  // timer then finds nothing to run.
  React.useEffect(
    () => () => {
      heldExitRef.current = null;
    },
    [],
  );

  // The timekeeper lost the seat (their own pre-start Leave): the match is
  // not readable for them any more (spec 6.2, TK-K17).
  const lostAccess = timekeeper.lostAccess;
  React.useEffect(() => {
    const r = rolesRef.current;
    if (lostAccess && r?.viewer === "timekeeper") exitNoContest("no_longer_timekeeper", r);
  }, [lostAccess, exitNoContest]);

  const markExiting = React.useCallback(() => {
    exitingRef.current = true;
  }, []);

  // Recorded only (M-R8): the broadcast's handler then re-reads, and the
  // cancelled snapshot's exit names the actor. An id that is not one of the
  // athletes names nobody (`noContestExit` resolves it against the roles).
  // An exit already held for the name runs now.
  const noteCancelActor = React.useCallback((actorId: string) => {
    cancelActorRef.current = actorId;
    heldExitRef.current?.();
  }, []);

  const snapshotListenersRef = React.useRef(new Set<(m: MatchDetails) => void>());
  const subscribeSnapshot = React.useCallback((listener: (m: MatchDetails) => void) => {
    const listeners = snapshotListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refreshTimekeeperState = timekeeper.refresh;
  const onSnapshot = React.useCallback(
    ({ match: fresh, confirmedAthleteIds: ids }: ReconcileSnapshot) => {
      applyMatch(fresh);
      if (ids) setConfirmedAthleteIds(ids);
      // Every snapshot, even one identical to the last (applyMatch keeps the
      // old object then, so no prop changes): the live step's pause re-sync
      // must be able to re-apply a read it deferred as possibly stale.
      for (const listener of snapshotListenersRef.current) listener(fresh);
      const current = stepRef.current;
      const snapshotRoles = deriveMatchRoles(fresh, currentAthleteId);
      const snapshot = matchSnapshot(fresh, ids, summaryEditCountRef.current);
      lastSnapshotRef.current = snapshot;
      if (!current || !snapshotRoles || exitingRef.current) return;

      const initial = firstSnapshotRef.current && !interactedRef.current;
      firstSnapshotRef.current = false;
      const action = planReconcile({ current, snapshot, roles: snapshotRoles, initial });
      if (action.type === "exit") {
        if (action.reason === "voided") {
          exitCancelled(
            "This result was voided on review. Any rating change was reversed.",
            "Match voided",
          );
        } else if ("cancelReason" in action) {
          // Timekeeper mode: the cancel carries its reason.
          exitAfterActor(action.cancelReason ?? null, snapshotRoles);
        } else {
          exitCancelled();
        }
        return;
      }
      if (action.type !== "goto") return;

      if (current === "live") stopRecorderRef.current?.();
      if (action.step === "live" && fresh.started_at) setStartedAt(fresh.started_at);
      if (action.step === "confirm" || action.step === "summary") {
        const rebuilt = resultFromRoles(snapshotRoles);
        setResultData((prev) => prev ?? rebuilt);
      }
      // Summary reads the stamped ELO; take the same refresh path the
      // confirm step's own completion takes.
      if (action.step === "summary") refresh();
      // A new step in timekeeper mode reads the state at once (a seat, the
      // start, the end), rather than at the next poll.
      if (snapshotRoles.mode === "timekeeper") refreshTimekeeperState();
      // planReconcile already guaranteed the direction, including the
      // allowed backward moves, so this bypasses the monotonic setter.
      trackSummary(current, action.step);
      setStepState(action.step);
    },
    [applyMatch, currentAthleteId, exitCancelled, exitAfterActor, refresh, refreshTimekeeperState, trackSummary],
  );

  const { reconcileNow, onChannelStatus } = useMatchReconciler({
    matchId,
    step,
    enabled: ready,
    roles,
    onSnapshot,
  });

  // Timekeeper mode switches the step channels to its cancel (`useStepMatchSync`):
  // this phone's sends name it, and a received cancel is re-read. Absent in a
  // two-athlete match, whose steps get exactly the context they always had.
  const timekeeperModeSelfId = roles?.mode === "timekeeper" ? currentAthleteId : undefined;
  const syncContext = React.useMemo(
    () => ({
      onChannelStatus,
      reconcileNow,
      markExiting,
      subscribeSnapshot,
      noteCancelActor,
      ...(timekeeperModeSelfId ? { timekeeperModeSelfId } : {}),
    }),
    [onChannelStatus, reconcileNow, markExiting, subscribeSnapshot, noteCancelActor, timekeeperModeSelfId],
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
    /** Null for a two-athlete match (`MatchFlowProvider`'s `tkState`). */
    tkState: timekeeper.state,
  };
}

import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { updateAthleteWeight } from "@jits/shared/api/athlete-weight";
import { NO_WEIGHT_CHECKS, type WeightChecksHandle } from "./use-match-weight-checks";
import { useMatchSyncContext, useStepMatchSync } from "./match-sync-context";
import type { MatchFlowValue } from "./match-flow-context";
import { useEffectiveRecordingOptIn } from "@/lib/moderation/ai-consent";
import { useRecordingIntent } from "./recording-intent";
import { useFaceoffLocationLog } from "./use-faceoff-location-log";
import { deriveWeightCheckView, type WeightCheckView } from "./weight-check-view";
import { useWeightCheckActions } from "./use-weight-check-actions";
import { useFaceoffAnnounce } from "./use-faceoff-announce";
import { useDualAutoStart } from "./use-dual-auto-start";
import { useFaceoffLeave } from "./use-faceoff-leave";
import { useMergedReady, type FaceoffTimekeeperView } from "./use-merged-ready";
import { useStartClaim, type StartClaim } from "./use-timekeeper-start";
import { PRESS_COPY } from "./press-copy";

export type { WeightCheckView } from "./weight-check-view";
export type { FaceoffTimekeeperView } from "./use-merged-ready";
export { isValidReweigh } from "./use-weight-check-actions";

/** How often face-off state is repeated until the match starts. A broadcast
 * sent before the other side's channel joined is simply gone, and none of
 * this state lives in the DB. */
export const FACEOFF_REPEAT_MS = 3_000;

/** What the face-off reads of the viewer's match flow (`MatchFlowProvider`'s value). */
export type FaceoffFlow = Pick<MatchFlowValue, "match" | "roles" | "tkState">;

export interface FaceoffParams {
  /** True on the weight and ready steps: the channel is open only then. */
  active: boolean;
  phase: "weight" | "ready" | null;
  matchId: string;
  exitHref: string;
  meId: string;
  opponentId: string;
  /** This match's weights (the challenge's, see useMatchWeights). */
  myWeight: number | null;
  opponentWeight: number | null;
  /** True once those are the challenge's rated weights. */
  weightsRated: boolean;
  /** The DB weight checks (jr_be-ahn.4). Absent or unavailable: the
   * pre-check flow (Confirm my weight moves straight to ready). */
  weightChecks?: WeightChecksHandle;
  /** Move the wizard to the ready step (weights confirmed). */
  onWeighedIn: () => void;
  /** start_match completed here, or the opponent's timer_started arrived. */
  onStarted: (startedAt: string) => void;
  /** The opponent cancelled: the wizard's single exit. */
  onCancelledRemotely: (description?: string) => void;
  /**
   * The viewer's match flow: its `roles.caps` choose the face-off's policies
   * (start, announce, ready, weight verdicts) and, in timekeeper mode, the
   * merged ready reads the timekeeper-mode state (ARCHITECTURE 2.3).
   * Omitted (the shipped flow's unit tests): the two-athlete policies, which
   * are also what a two-athlete match's caps choose.
   */
  flow?: FaceoffFlow | null;
}

export interface Faceoff {
  /** This match's weights; a profile edit never changes them. */
  myWeight: number | null;
  opponentWeight: number | null;
  weightsRated: boolean;
  /** The profile weight just saved from the pencil (future matches). */
  profileWeightSaved: number | null;
  /** The pencil's editor is open (Confirm waits for it). */
  weightEditorOpen: boolean;
  setWeightEditorOpen: (open: boolean) => void;
  myWeighed: boolean;
  opponentWeighed: boolean;
  myReady: boolean;
  opponentReady: boolean;
  /** Null until the opponent's choice has arrived. */
  opponentRecording: boolean | null;
  recording: boolean;
  starting: boolean;
  cancelling: boolean;
  savingWeight: boolean;
  /** Leave is offered until the match starts (and, for the timekeeper, not while their Start is in flight). */
  canLeave: boolean;
  confirmWeight: () => Promise<void>;
  /** Save a new PROFILE weight (future matches); false when refused. */
  editWeight: (lbs: number) => Promise<boolean>;
  tapReady: () => void;
  /**
   * The Leave control: confirm, then act on the viewer's `roles.caps.leave`
   * (`useFaceoffLeave`): an athlete cancels the match for everyone (TK-E4
   * names the opponent once a timekeeper is seated); the timekeeper leaves
   * the seat before the start (TK-K14).
   */
  leave: () => void;
  /**
   * The timekeeper's Start (`faceoff-timekeeper.tsx`) claims the face-off
   * here, so their Start and their Leave exclude each other.
   */
  timekeeperStart: StartClaim;
  /** The opponent weight check (jr_be-ahn.4). */
  weightCheck: WeightCheckView;
  /**
   * Timekeeper mode, for an athlete: the seated timekeeper and the server's
   * face-off (ready rows, the timekeeper's checks, the face-off timeout),
   * plus the merged ready's busy state. Null in a two-athlete match.
   */
  timekeeper: FaceoffTimekeeperView | null;
}

/** The face-off's policy inputs from the viewer's caps; without them, the two-athlete flow's. */
function policyOf(flow: FaceoffFlow | null | undefined) {
  const caps = flow?.roles.caps;
  return {
    autoStart: caps?.autoStart ?? true,
    readyPolicy: caps?.readyPolicy ?? "broadcast",
    weightVerdicts: caps?.weightVerdicts ?? "opponent",
  } as const;
}

/**
 * The face-off (weight + ready merged into one screen, two phases): the
 * weigh-in, the ready handshake, recording opt-in and Leave, all on one
 * match channel that stays open across both phases.
 *
 * Composed from policies (timekeeper mode ARCHITECTURE 2.3), chosen by the
 * viewer's caps (`flow.roles.caps`): the announce (`useFaceoffAnnounce`),
 * the pure weight-check view (`deriveWeightCheckView`) with its actions, the
 * start policy and Leave (`useFaceoffLeave`).
 *  - Two-athlete flow (`autoStart`, `readyPolicy` "broadcast"): both tap
 *    ready and both race `start_match` (`useDualAutoStart`, with the bounded
 *    retry of A29); weighed-in, ready and recording are broadcast-only and
 *    repeated, and the DB stays the truth for everything that has a column
 *    (the wizard's reconciler).
 *  - Timekeeper mode, an athlete (`readyPolicy` "server_merged"): no
 *    auto-start (the timekeeper's Start, `faceoff-timekeeper.tsx`); ready is
 *    the server's, merged with the opponent check (`useMergedReady`); only
 *    the recording choice is broadcast; a received `timer_started` only
 *    re-reads (M-R8).
 * The timekeeper's own face-off is `faceoff-timekeeper.tsx`: this provider
 * stays mounted for them, inactive, and gives them only Leave (the seat's
 * drop-out, `roles.caps.leave`) and the claim their Start takes against it.
 */
export function useFaceoff(p: FaceoffParams): Faceoff {
  // Off until the athlete allowed AI processing (5.1.2(i)), whatever was remembered.
  const recording = useEffectiveRecordingOptIn(p.meId);
  // Record only (live location fixes 4.6): one silent reading logged as
  // match_start, never awaited by anything below and never asking.
  useFaceoffLocationLog(p.matchId, p.active);
  const [profileWeightSaved, setProfileWeightSaved] = React.useState<number | null>(null);
  const [weightEditorOpen, setWeightEditorOpen] = React.useState(false);
  const [myWeighed, setMyWeighed] = React.useState(p.phase === "ready");
  const [opponentWeighed, setOpponentWeighed] = React.useState(false);
  const [myReady, setMyReady] = React.useState(false);
  const [opponentReady, setOpponentReady] = React.useState(false);
  const [opponentRecording, setOpponentRecording] = React.useState<boolean | null>(null);
  const [savingWeight, setSavingWeight] = React.useState(false);
  const startedRef = React.useRef(false);
  const cancelledRef = React.useRef(false);
  const checks = p.weightChecks ?? NO_WEIGHT_CHECKS;
  const policy = policyOf(p.flow);
  const checkState = deriveWeightCheckView(checks, p.meId, policy.weightVerdicts);
  const { reconcileNow, timekeeperModeSelfId } = useMatchSyncContext();
  const timekeeperModeRef = React.useRef(false);
  timekeeperModeRef.current = timekeeperModeSelfId != null;
  // Timekeeper mode: ready is server state, merged with the opponent check.
  const merged = useMergedReady({
    flow: p.flow,
    matchId: p.matchId,
    onRefused: () => {
      checks.refetch();
      reconcileNow();
    },
  });
  const tk = merged.view;
  const serverReadyRef = React.useRef(tk != null);
  serverReadyRef.current = tk != null;
  const markReadyRef = React.useRef(merged.markReady);
  markReadyRef.current = merged.markReady;
  // What this athlete is shown: the server's ready rows in timekeeper mode
  // (ready implies weighed in there too), the broadcasts otherwise.
  const myReadyNow = tk ? tk.meReady : myReady;
  const opponentReadyNow = tk ? tk.opponentReady : opponentReady;
  const canStartRef = React.useRef(checkState.canStart);
  canStartRef.current = checkState.canStart;

  const weightEditorOpenRef = React.useRef(weightEditorOpen);
  weightEditorOpenRef.current = weightEditorOpen;
  const pRef = React.useRef(p);
  pRef.current = p;
  const myReadyRef = React.useRef(myReadyNow);
  myReadyRef.current = myReadyNow;
  // The toggle, persisted for the server too (jits-n2im.14). Fire and
  // forget: ready never waits on it.
  useRecordingIntent(p.meId, p.matchId, recording, p.active, myReadyNow);

  const sync = useStepMatchSync({
    matchId: p.matchId,
    enabled: p.active,
    // The weight in the payload is informational: both sides read the
    // rated weights from the challenge.
    onWeighedIn: (athleteId) => {
      if (athleteId === pRef.current.opponentId) setOpponentWeighed(true);
    },
    onRecordingOptIn: (athleteId, on) => {
      if (athleteId === pRef.current.opponentId) setOpponentRecording(on);
    },
    onReadySignal: (athleteId) => {
      if (athleteId !== pRef.current.opponentId) return;
      // Ready implies weighed in, even if that broadcast was lost.
      setOpponentWeighed(true);
      setOpponentReady(true);
    },
    onTimerStarted: (startedAt) => {
      // Timekeeper mode: the timekeeper's start is a hint to re-read (M-R8);
      // the reconciler moves to live on the DB's status.
      if (serverReadyRef.current) {
        reconcileNow();
        return;
      }
      if (startedRef.current) return;
      startedRef.current = true;
      pRef.current.onStarted(startedAt);
    },
    onMatchCancelled: () => {
      if (cancelledRef.current || startedRef.current) return;
      cancelledRef.current = true;
      pRef.current.onCancelledRemotely(
        pRef.current.phase === "ready" ? "Your opponent left the ready check." : "Your opponent cancelled the match.",
      );
    },
  });

  useFaceoffAnnounce({
    active: p.active,
    meId: p.meId,
    recording,
    myWeighed,
    myReady,
    myWeight: p.myWeight,
    startedRef,
    cancelledRef,
    repeatMs: FACEOFF_REPEAT_MS,
    readyPolicy: policy.readyPolicy,
    broadcastRecordingOptIn: sync.broadcastRecordingOptIn,
    broadcastWeighedIn: sync.broadcastWeighedIn,
    broadcastReady: sync.broadcastReady,
  });

  const { starting, stop: stopStartRun } = useDualAutoStart({
    matchId: p.matchId,
    // Timekeeper mode: no auto-start; only the timekeeper starts the match.
    enabled: policy.autoStart,
    myReady,
    opponentReady,
    canStart: checkState.canStart,
    startedRef,
    cancelledRef,
    broadcastTimerStarted: sync.broadcastTimerStarted,
    onStarted: p.onStarted,
    onWeightGate: () => {
      setMyReady(false);
      checks.refetch();
    },
    onGaveUp: () => setMyReady(false),
  });

  const editWeight = React.useCallback(async (lbs: number) => {
    setSavingWeight(true);
    const res = await updateAthleteWeight(supabase, pRef.current.meId, lbs);
    setSavingWeight(false);
    if (!res.ok) {
      // A timekeeper-mode surface never shows the server's text (M-R4, spec 14.9 X1), only the guidance (PM29).
      if (timekeeperModeRef.current) toast.error({ text1: "Couldn't update weight", description: PRESS_COPY.checkConnection });
      else toast.error({ text1: "Couldn't update weight", description: res.error.message });
      return false;
    }
    setProfileWeightSaved(res.data.weight);
    return true;
  }, []);

  // Ready once my weight is in and my check of theirs is confirmed; with no
  // checks for this match, once my weight is in (the pre-check flow).
  const myCheckDone = checkState.mine?.status === "confirmed";
  const mergedCheck = tk != null;
  React.useEffect(() => {
    if (p.phase !== "weight" || !myWeighed) return;
    // Timekeeper mode: the check is merged into ready (TK-F4), so at once.
    if (mergedCheck) {
      pRef.current.onWeighedIn();
      return;
    }
    if (checks.status === "unavailable" || checks.status === "idle" || myCheckDone) pRef.current.onWeighedIn();
  }, [p.phase, myWeighed, checks.status, myCheckDone, mergedCheck]);

  const confirmWeight = React.useCallback(async () => {
    if (weightEditorOpenRef.current) return;
    setMyWeighed(true);
  }, []);

  const actions = useWeightCheckActions({ matchId: p.matchId, opponentWeight: p.opponentWeight, checks });

  const tapReady = React.useCallback(() => {
    if (myReadyRef.current) return;
    // Timekeeper mode: the merged ready (the server holds the weight gate).
    if (serverReadyRef.current) {
      markReadyRef.current();
      return;
    }
    if (!canStartRef.current) return;
    setMyReady(true);
  }, []);

  // Leave acts on the viewer's policy (`roles.caps.leave`) and its alert
  // names them (`roles`): the shipped cancel and alert in a two-athlete match
  // and while no timekeeper is seated, TK-E4 for a seated timekeeper's
  // athletes, the seat's drop-out (TK-K14) for the timekeeper.
  const leaveBase = {
    matchId: p.matchId,
    exitHref: p.exitHref,
    startedRef,
    cancelledRef,
    broadcastMatchCancelled: sync.broadcastMatchCancelled,
  };
  const { cancelling, leave: askToLeave } = useFaceoffLeave(
    p.flow ? { ...leaveBase, leave: p.flow.roles.caps.leave, roles: p.flow.roles } : leaveBase,
  );
  // A Leave during a failed start run (A29) ends the run before its alert
  // opens: a retry firing under the open alert would claim the face-off and
  // turn Cancel Match into a no-op. No failure: the shipped Leave, unchanged.
  const leave = React.useCallback(() => {
    stopStartRun();
    askToLeave();
  }, [stopStartRun, askToLeave]);
  // The timekeeper's Start and Leave exclude each other.
  const seat = useStartClaim(startedRef, cancelledRef);

  return {
    myWeight: p.myWeight,
    opponentWeight: p.opponentWeight,
    weightsRated: p.weightsRated,
    profileWeightSaved,
    weightEditorOpen,
    setWeightEditorOpen,
    myWeighed,
    opponentWeighed: tk ? tk.opponentReady : opponentWeighed,
    myReady: myReadyNow,
    opponentReady: opponentReadyNow,
    opponentRecording,
    recording,
    starting,
    cancelling,
    savingWeight,
    canLeave: !starting && !seat.claimed && !startedRef.current,
    confirmWeight,
    editWeight,
    tapReady,
    leave,
    timekeeperStart: seat.claim,
    weightCheck: { ...checkState, busy: actions.busy, check: actions.check, reweigh: actions.reweigh },
    timekeeper: tk,
  };
}

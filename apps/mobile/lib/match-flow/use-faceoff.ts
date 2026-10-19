import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { updateAthleteWeight } from "@jits/shared/api/athlete-weight";
import { NO_WEIGHT_CHECKS, type WeightChecksHandle } from "./use-match-weight-checks";
import { useStepMatchSync } from "./match-sync-context";
import { useEffectiveRecordingOptIn } from "@/lib/moderation/ai-consent";
import { useRecordingIntent } from "./recording-intent";
import { useFaceoffLocationLog } from "./use-faceoff-location-log";
import { deriveWeightCheckView, type WeightCheckView } from "./weight-check-view";
import { useWeightCheckActions } from "./use-weight-check-actions";
import { useFaceoffAnnounce } from "./use-faceoff-announce";
import { useDualAutoStart } from "./use-dual-auto-start";
import { useFaceoffLeave } from "./use-faceoff-leave";

export type { WeightCheckView } from "./weight-check-view";
export { isValidReweigh } from "./use-weight-check-actions";

/** How often face-off state is repeated until the match starts. A broadcast
 * sent before the other side's channel joined is simply gone, and none of
 * this state lives in the DB. */
export const FACEOFF_REPEAT_MS = 3_000;

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
  /** Leave is offered until the match starts. */
  canLeave: boolean;
  confirmWeight: () => Promise<void>;
  /** Save a new PROFILE weight (future matches); false when refused. */
  editWeight: (lbs: number) => Promise<boolean>;
  tapReady: () => void;
  /** The Leave control: confirm, then cancel the match for both. */
  leave: () => void;
  /** The opponent weight check (jr_be-ahn.4). */
  weightCheck: WeightCheckView;
}

/**
 * The face-off (weight + ready merged into one screen, two phases): the
 * weigh-in, the ready handshake, recording opt-in and Leave, all on one
 * match channel that stays open across both phases.
 *
 * Composed from policies (timekeeper mode ARCHITECTURE 2.3): the announce
 * (`useFaceoffAnnounce`), the pure weight-check view
 * (`deriveWeightCheckView`) with its actions, the start policy
 * (`useDualAutoStart`: both tap ready, both race `start_match`, the loser of
 * the race reads the DB) and Leave (`useFaceoffLeave`). The DB stays the
 * truth for everything that has a column (the wizard's reconciler);
 * weighed-in, ready and recording are broadcast-only and repeated.
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
  const checkState = deriveWeightCheckView(checks, p.meId);
  const canStartRef = React.useRef(checkState.canStart);
  canStartRef.current = checkState.canStart;

  const weightEditorOpenRef = React.useRef(weightEditorOpen);
  weightEditorOpenRef.current = weightEditorOpen;
  const pRef = React.useRef(p);
  pRef.current = p;
  const myReadyRef = React.useRef(myReady);
  myReadyRef.current = myReady;
  // The toggle, persisted for the server too (jits-n2im.14). Fire and
  // forget: ready never waits on it.
  useRecordingIntent(p.meId, p.matchId, recording, p.active, myReady);

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
    broadcastRecordingOptIn: sync.broadcastRecordingOptIn,
    broadcastWeighedIn: sync.broadcastWeighedIn,
    broadcastReady: sync.broadcastReady,
  });

  const { starting } = useDualAutoStart({
    matchId: p.matchId,
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
  });

  const editWeight = React.useCallback(async (lbs: number) => {
    setSavingWeight(true);
    const res = await updateAthleteWeight(supabase, pRef.current.meId, lbs);
    setSavingWeight(false);
    if (!res.ok) {
      toast.error({ text1: "Couldn't update weight", description: res.error.message });
      return false;
    }
    setProfileWeightSaved(res.data.weight);
    return true;
  }, []);

  // Ready once my weight is in and my check of theirs is confirmed; with no
  // checks for this match, once my weight is in (the pre-check flow).
  const myCheckDone = checkState.mine?.status === "confirmed";
  React.useEffect(() => {
    if (p.phase !== "weight" || !myWeighed) return;
    if (checks.status === "unavailable" || checks.status === "idle" || myCheckDone) pRef.current.onWeighedIn();
  }, [p.phase, myWeighed, checks.status, myCheckDone]);

  const confirmWeight = React.useCallback(async () => {
    if (weightEditorOpenRef.current) return;
    setMyWeighed(true);
  }, []);

  const actions = useWeightCheckActions({ matchId: p.matchId, opponentWeight: p.opponentWeight, checks });

  const tapReady = React.useCallback(() => {
    if (myReadyRef.current || !canStartRef.current) return;
    setMyReady(true);
  }, []);

  const { cancelling, leave } = useFaceoffLeave({
    matchId: p.matchId,
    exitHref: p.exitHref,
    startedRef,
    cancelledRef,
    broadcastMatchCancelled: sync.broadcastMatchCancelled,
  });

  return {
    myWeight: p.myWeight,
    opponentWeight: p.opponentWeight,
    weightsRated: p.weightsRated,
    profileWeightSaved,
    weightEditorOpen,
    setWeightEditorOpen,
    myWeighed,
    opponentWeighed,
    myReady,
    opponentReady,
    opponentRecording,
    recording,
    starting,
    cancelling,
    savingWeight,
    canLeave: !starting && !startedRef.current,
    confirmWeight,
    editWeight,
    tapReady,
    leave,
    weightCheck: { ...checkState, busy: actions.busy, check: actions.check, reweigh: actions.reweigh },
  };
}

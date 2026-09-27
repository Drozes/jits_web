import * as React from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { cancelSessionMatch, startMatch } from "@jits/shared/api/mutations";
import { updateAthleteWeight } from "@jits/shared/api/athlete-weight";
import { getMatchDetails } from "@jits/shared/api/queries";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { exitMatchTo } from "./exit-to";
import { SEND_GRACE_MS, useMatchSyncContext, useStepMatchSync } from "./match-sync-context";
import { useRecordingOptIn } from "./recording-optin";

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
}

/**
 * The face-off (weight + ready merged into one screen, two phases): the
 * weigh-in, the ready handshake, recording opt-in and Leave, all on one
 * match channel that stays open across both phases.
 *
 * The ready handshake is the old ready step's, unchanged: both tap ready,
 * both race `start_match`, the loser of the race reads the DB. The DB stays
 * the truth for everything that has a column (the wizard's reconciler);
 * weighed-in, ready and recording are broadcast-only and repeated.
 */
export function useFaceoff(p: FaceoffParams): Faceoff {
  const router = useRouter();
  const { markExiting } = useMatchSyncContext();
  const recording = useRecordingOptIn();
  const [profileWeightSaved, setProfileWeightSaved] = React.useState<number | null>(null);
  const [weightEditorOpen, setWeightEditorOpen] = React.useState(false);
  const [myWeighed, setMyWeighed] = React.useState(p.phase === "ready");
  const [opponentWeighed, setOpponentWeighed] = React.useState(false);
  const [myReady, setMyReady] = React.useState(false);
  const [opponentReady, setOpponentReady] = React.useState(false);
  const [opponentRecording, setOpponentRecording] = React.useState<boolean | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [savingWeight, setSavingWeight] = React.useState(false);
  const startedRef = React.useRef(false);
  const cancelledRef = React.useRef(false);
  const myWeight = p.myWeight;
  const opponentWeight = p.opponentWeight;

  const weightEditorOpenRef = React.useRef(weightEditorOpen);
  weightEditorOpenRef.current = weightEditorOpen;
  const pRef = React.useRef(p);
  pRef.current = p;
  const stateRef = React.useRef({ myWeighed, myReady, myWeight, recording });
  stateRef.current = { myWeighed, myReady, myWeight, recording };


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
  const { broadcastWeighedIn, broadcastRecordingOptIn, broadcastReady, broadcastTimerStarted, broadcastMatchCancelled } =
    sync;

  // Say where this side stands: on joining, on every change, and on a
  // repeat until the match starts.
  const announce = React.useCallback(() => {
    if (!pRef.current.active || startedRef.current || cancelledRef.current) return;
    const s = stateRef.current;
    const me = pRef.current.meId;
    void broadcastRecordingOptIn(me, s.recording);
    if (s.myWeighed) void broadcastWeighedIn(me, s.myWeight);
    if (s.myReady) void broadcastReady(me);
  }, [broadcastRecordingOptIn, broadcastWeighedIn, broadcastReady]);

  React.useEffect(() => {
    announce();
  }, [announce, recording, myWeighed, myReady, p.active]);

  React.useEffect(() => {
    if (!p.active) return;
    const id = setInterval(announce, FACEOFF_REPEAT_MS);
    return () => clearInterval(id);
  }, [p.active, announce]);

  const handleStart = React.useCallback(async () => {
    // Never start a match this athlete is cancelling (Leave in flight).
    if (startedRef.current || cancelledRef.current) return;
    startedRef.current = true;
    setStarting(true);
    const result = await startMatch(supabase, pRef.current.matchId);
    // Left while start_match was in flight: the cancel owns the exit now.
    // Reset the spinner so a failed cancel (which re-arms Leave) is not left
    // stuck on "Starting match...".
    if (cancelledRef.current) {
      startedRef.current = false;
      setStarting(false);
      return;
    }
    if (!result.ok) {
      // Both devices race start_match; losing the race is not an error.
      const match = await getMatchDetails(supabase, pRef.current.matchId);
      if (match?.status === "in_progress" && match.started_at) {
        pRef.current.onStarted(match.started_at);
        return;
      }
      startedRef.current = false;
      setStarting(false);
      toast.error({ text1: "Couldn't start match", description: result.error.message });
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    // Let timer_started leave the device before the step unmounts (jits-mzfu).
    await settleWithin(broadcastTimerStarted(startedAt), SEND_GRACE_MS);
    pRef.current.onStarted(startedAt);
  }, [broadcastTimerStarted]);

  React.useEffect(() => {
    if (myReady && opponentReady && !startedRef.current && !starting) void handleStart();
  }, [myReady, opponentReady, starting, handleStart]);

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

  const confirmWeight = React.useCallback(async () => {
    if (weightEditorOpenRef.current) return;
    setMyWeighed(true);
    pRef.current.onWeighedIn();
  }, []);

  const tapReady = React.useCallback(() => {
    if (stateRef.current.myReady) return;
    setMyReady(true);
  }, []);

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
  }, [broadcastMatchCancelled, markExiting, router]);

  const leave = React.useCallback(() => {
    if (cancelledRef.current || startedRef.current) return;
    Alert.alert("Cancel match?", "Your opponent will be returned to the lobby.", [
      { text: "Keep Waiting", style: "cancel" },
      { text: "Cancel Match", style: "destructive", onPress: () => void doCancel() },
    ]);
  }, [doCancel]);

  return {
    myWeight,
    opponentWeight,
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
  };
}

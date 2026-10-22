import * as React from "react";
import type { MatchStep } from "@/lib/match-flow/step-router";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { MatchExtras } from "@/lib/match-flow/match-extras";
import type { RecordedMeta } from "@/lib/match-flow/use-record-result";
import { useMatchFlow } from "@/lib/match-flow/match-flow-context";
import { stepSeams } from "@/lib/match-flow/step-seams";
import { confirmStepInputs, resultStepInputs, verdictStepInputs } from "@/lib/match-flow/result-confirm-inputs";
import { EndStep } from "./steps/end-step";
import { ResultStep } from "./steps/result-step";
import { ConfirmStep } from "./steps/confirm-step";
import { TimekeeperDone } from "./steps/timekeeper-done";
import { FaceoffBody } from "./faceoff/faceoff-body";
import { FaceoffTimekeeper } from "./faceoff/faceoff-timekeeper";
import { CrewStep } from "./crew/crew-step";
import { LiveStage } from "./countdown/live-stage";
import { VerdictStep } from "./verdict/verdict-step";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { deriveUploadBannerState } from "@/lib/video/upload-banner-state";
import { useMatchRecorder } from "./match-recorder-context";
import { MatchUploadLine } from "./match-upload-line";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
import { HOME_HREF } from "@/lib/deep-links/retired-routes";
import { View } from "react-native";

interface MatchStepRendererProps {
  step: MatchStep;
  /** Where the steps that leave the wizard navigate to. */
  exitHref: string;
  /** Copy on the verdict's exit cta. */
  exitLabel: string;
  matchId: string;
  matchStatus: string;
  durationSeconds: number;
  /** The server's `started_at` (the countdown and clock shift it to GO). */
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  submissionTypes: SubmissionType[];
  resultData: BroadcastResult | null;
  ownOutcome: "win" | "loss" | "draw" | null;
  /** Athletes with a confirmation row in the DB (from the reconciler). */
  confirmedAthleteIds: string[];
  /** B3/B4 fields read from the match in hand (null on an older backend). */
  extras: MatchExtras;
  /** "Record from my phone" (decision 5). */
  recording: boolean;
  /** The match's rated weights (see useMatchWeights). */
  matchWeights?: { mine: number | null; theirs: number | null };
  setStep: (step: MatchStep) => void;
  setResultData: (r: BroadcastResult) => void;
  advanceToResult: () => void;
  /** Match clock at End Match, seeds the result step's finish time. */
  initialFinishSeconds?: number;
  /** Records the match clock reading taken when the live step ended. */
  setFinishSeconds: (seconds: number) => void;
  refresh: () => void;
}

/**
 * One step at a time. The face-off header and the camera are rendered by the
 * wizard above this (they span steps); weight and ready render the face-off
 * body here, live renders the countdown then the frozen live screen. The
 * athletes and what this viewer may do come from the viewer's roles
 * (`MatchFlowProvider`), and the policy seams take their inputs from
 * `stepSeams(roles)` (timekeeper mode ARCHITECTURE 2.3), so a two-athlete
 * match passes exactly the defaults the steps had before.
 *
 * Timekeeper mode adds the `crew` step (the athletes pick a timekeeper), and
 * the timekeeper, who has no athlete pair of their own, gets their own
 * face-off and done screen and sees the two athletes challenger first on the
 * live and result screens. Every weight the timekeeper sees is a rated
 * weight from the timekeeper-mode state (PM26), never a profile weight: the
 * face-off gets `seams.ratedWeights`, and the live screen (countdown chip
 * and athlete bars) and the result form get `seams.pair`, whose `weightLbs`
 * is the rated weight.
 */
export function MatchStepRenderer(props: MatchStepRendererProps) {
  const {
    step,
    exitHref,
    exitLabel,
    matchId,
    matchStatus,
    durationSeconds,
    startedAt,
    pausedAt,
    totalPausedDuration,
    submissionTypes,
    resultData,
    ownOutcome,
    confirmedAthleteIds,
    extras,
    recording,
    matchWeights,
    setStep,
    setResultData,
    advanceToResult,
    initialFinishSeconds,
    setFinishSeconds,
    refresh,
  } = props;
  // One recorder for the whole wizard, owned by MatchRecorderProvider above
  // this component. The verdict reads the match-keyed upload store, which
  // survives this subtree remounting and a late-finishing upload.
  const recorder = useMatchRecorder();
  const upload = useMatchUpload(matchId);
  // The app-wide upload strip (jits-n2im.2): hidden for every job on the
  // countdown and live screen, and for this match's own job everywhere in
  // the wizard (the compact line and the verdict's Film block say it).
  useSuppressUploadStrip(step === "live" ? { kind: "all" } : { kind: "match", matchId });
  const { match, roles, tkState } = useMatchFlow();
  const { me, opponent, caps } = roles;
  // An athlete sees themselves and their opponent (`pair`); the timekeeper
  // sees the two athletes, challenger first.
  const athleteViewer = me != null && opponent != null;
  const seams = React.useMemo(() => stepSeams(roles, tkState), [roles, tkState]);
  const [left, right] = seams.pair;
  // The countdown chip's weights: an athlete's match weights as before; the
  // timekeeper's pair already holds the rated ones (PM26, no fallback).
  const leftWeight = athleteViewer ? (matchWeights?.mine ?? left.weightLbs) : left.weightLbs;
  const rightWeight = athleteViewer ? (matchWeights?.theirs ?? right.weightLbs) : right.weightLbs;
  // The finish's name: the recorded one, else the catalogue's for the broadcast code.
  const submissionName =
    extras.submissionName ??
    (resultData?.submissionCode
      ? (submissionTypes.find((t) => t.code === resultData.submissionCode)?.display_name ?? null)
      : null);

  if (step === "crew") return <CrewStep matchId={matchId} exitHref={exitHref} />;
  if (step === "weight" || step === "ready") {
    if (!athleteViewer) {
      return (
        <FaceoffTimekeeper
          matchId={matchId}
          durationSeconds={durationSeconds}
          exitHref={exitHref}
          ratedWeights={seams.ratedWeights ?? []}
        />
      );
    }
    return <FaceoffBody phase={step} me={me} opponent={opponent} matchId={matchId} durationSeconds={durationSeconds} />;
  }
  if (step === "live") {
    return (
      <LiveStage
        matchId={matchId}
        me={left}
        opponent={right}
        durationSeconds={durationSeconds}
        startedAt={startedAt}
        pausedAt={pausedAt}
        totalPausedDuration={totalPausedDuration}
        recorder={recorder}
        recording={recording}
        myWeight={leftWeight}
        opponentWeight={rightWeight}
        {...seams.live}
        onEnded={(seconds) => {
          setFinishSeconds(seconds);
          setStep(seams.afterLive);
        }}
      />
    );
  }
  if (step === "end") {
    return (
      <View>
        <EndStep onAdvance={advanceToResult} />
        <MatchUploadLine matchId={matchId} />
      </View>
    );
  }
  if (step === "result") {
    return (
      <View style={{ gap: 12 }}>
        <ResultStep
          matchId={matchId}
          durationSeconds={durationSeconds}
          initialFinishSeconds={initialFinishSeconds}
          me={left}
          opponent={right}
          submissionTypes={submissionTypes}
          submissionLayout={caps.submissionLayout}
          {...resultStepInputs(match, tkState)}
          {...seams.resultEntry}
          onRecorded={(r: BroadcastResult, meta: RecordedMeta) => {
            setResultData(r);
            if (meta.recorderConfirmed || !caps.canConfirm) {
              // Auto-confirmed server-side (B2), or a recorder who never
              // confirms (the timekeeper): straight to the verdict or the done
              // screen, on the same refresh path the confirm step's
              // completion takes.
              refresh();
              setStep("summary");
            } else {
              setStep("confirm");
            }
          }}
        />
        <MatchUploadLine matchId={matchId} />
      </View>
    );
  }
  if ((step === "confirm" || step === "summary") && !athleteViewer) {
    return (
      <TimekeeperDone
        matchId={matchId}
        // The timekeeper exits to Home after `Done` (spec 4.2 Final), never
        // to the route's exit (the Arena): the Home card reopens the done
        // screen while the edit window is open (TK-H8, TK-H9).
        exitHref={HOME_HREF}
        durationSeconds={durationSeconds}
        submissionTypes={submissionTypes}
        confirmedAthleteIds={confirmedAthleteIds}
        resultData={resultData}
        extras={extras}
      />
    );
  }
  if (!athleteViewer) return null;
  if (step === "confirm") {
    return (
      <View style={{ gap: 12 }}>
        <ConfirmStep
          matchId={matchId}
          me={me}
          opponent={opponent}
          resultData={resultData}
          confirmedAthleteIds={confirmedAthleteIds}
          submissionName={submissionName}
          finishTimeSeconds={extras.finishTimeSeconds ?? resultData?.finishTimeSeconds ?? null}
          disputeLocksAt={extras.disputeLocksAt}
          completedAt={extras.completedAt}
          recorderName={seams.confirmRecorderName}
          {...confirmStepInputs(match, roles, initialFinishSeconds)}
          onCompleted={() => {
            refresh();
            setStep("summary");
          }}
        />
        <MatchUploadLine matchId={matchId} />
      </View>
    );
  }
  if (step === "summary") {
    return (
      <VerdictStep
        matchId={matchId}
        exitHref={exitHref}
        exitLabel={exitLabel}
        matchStatus={matchStatus}
        outcome={ownOutcome}
        me={me}
        opponent={opponent}
        {...verdictStepInputs(roles, resultData, extras, submissionName)}
        upload={deriveUploadBannerState(recorder.state, recorder.error, upload)}
        uploadedVideoId={upload?.status === "uploaded" ? (upload.videoId ?? null) : null}
        confirmedAthleteIds={confirmedAthleteIds}
        completedAt={extras.completedAt}
      />
    );
  }
  return null;
}

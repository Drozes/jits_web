import type { MatchStep } from "@/lib/match-flow/step-router";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { MatchExtras } from "@/lib/match-flow/match-extras";
import type { RecordedMeta } from "@/lib/match-flow/use-record-result";
import { EndStep } from "./steps/end-step";
import { ResultStep } from "./steps/result-step";
import { ConfirmStep } from "./steps/confirm-step";
import { WaitStep } from "./steps/wait-step";
import { FaceoffBody } from "./faceoff/faceoff-body";
import { LiveStage } from "./countdown/live-stage";
import { VerdictStep } from "./verdict/verdict-step";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { deriveUploadBannerState } from "@/lib/video/upload-banner-state";
import { useMatchRecorder } from "./match-recorder-context";
import { MatchUploadLine } from "./match-upload-line";
import { useSuppressUploadStrip } from "@/lib/video/upload-strip-visibility";
import { View } from "react-native";

export interface MatchParticipant {
  athlete_id: string;
  display_name: string;
  current_elo: number | null;
  current_weight: number | null;
  outcome: string | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_delta: number | null;
  /** BE-stamped IBJJF division gap used for the phantom-ELO adjustment. */
  weight_division_gap: number | null;
}

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
  me: MatchParticipant;
  opponent: MatchParticipant;
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
 * body here, live renders the countdown then the frozen live screen.
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
    me,
    opponent,
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

  if (step === "wait") {
    return <WaitStep message="Waiting for opponent..." allowSkip onSkip={() => setStep("weight")} />;
  }
  if (step === "weight" || step === "ready") {
    return <FaceoffBody phase={step} me={me} opponent={opponent} durationSeconds={durationSeconds} />;
  }
  if (step === "live") {
    return (
      <LiveStage
        matchId={matchId}
        me={me}
        opponent={opponent}
        durationSeconds={durationSeconds}
        startedAt={startedAt}
        pausedAt={pausedAt}
        totalPausedDuration={totalPausedDuration}
        recorder={recorder}
        recording={recording}
        myWeight={matchWeights?.mine ?? me.current_weight}
        opponentWeight={matchWeights?.theirs ?? opponent.current_weight}
        onEnded={(seconds) => {
          setFinishSeconds(seconds);
          setStep("end");
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
    const athlete = (p: MatchParticipant) => ({
      id: p.athlete_id,
      displayName: p.display_name,
      elo: p.current_elo,
      weight: p.current_weight,
    });
    return (
      <View style={{ gap: 12 }}>
        <ResultStep
          matchId={matchId}
          durationSeconds={durationSeconds}
          initialFinishSeconds={initialFinishSeconds}
          me={athlete(me)}
          opponent={athlete(opponent)}
          submissionTypes={submissionTypes}
          onRecorded={(r: BroadcastResult, meta: RecordedMeta) => {
            setResultData(r);
            if (meta.recorderConfirmed) {
              // Auto-confirmed server-side (B2): straight to the verdict, on
              // the same refresh path the confirm step's completion takes.
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
  if (step === "confirm") {
    const submissionName =
      extras.submissionName ??
      (resultData?.submissionCode
        ? (submissionTypes.find((t) => t.code === resultData.submissionCode)?.display_name ?? null)
        : null);
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
    const submissionName =
      extras.submissionName ??
      (resultData?.submissionCode
        ? (submissionTypes.find((t) => t.code === resultData.submissionCode)?.display_name ?? null)
        : null);
    return (
      <VerdictStep
        matchId={matchId}
        exitHref={exitHref}
        exitLabel={exitLabel}
        matchStatus={matchStatus}
        outcome={ownOutcome}
        me={me}
        opponent={opponent}
        submissionName={submissionName}
        finishTimeSeconds={extras.finishTimeSeconds ?? resultData?.finishTimeSeconds ?? null}
        upload={deriveUploadBannerState(recorder.state, recorder.error, upload)}
        uploadedVideoId={upload?.status === "uploaded" ? (upload.videoId ?? null) : null}
        confirmedAthleteIds={confirmedAthleteIds}
        resultType={resultData?.result ?? null}
        completedAt={extras.completedAt}
      />
    );
  }
  return null;
}

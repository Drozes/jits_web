import type { MatchStep } from "@/lib/match-flow/step-router";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { WeightStep } from "./steps/weight-step";
import { ReadyStep } from "./steps/ready-step";
import { LiveStep } from "./steps/live-step";
import { EndStep } from "./steps/end-step";
import { ResultStep } from "./steps/result-step";
import { ConfirmStep } from "./steps/confirm-step";
import { SummaryStep } from "./steps/summary-step";
import { WaitStep } from "./steps/wait-step";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { useMatchRecorder } from "./match-recorder-context";

interface MatchParticipant {
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
  /** Copy on the summary step's exit cta. */
  exitLabel: string;
  matchId: string;
  matchType: "ranked" | "casual";
  matchStatus: string;
  durationSeconds: number;
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
  setStep: (step: MatchStep) => void;
  setStartedAt: (s: string) => void;
  setResultData: (r: BroadcastResult) => void;
  advanceToResult: () => void;
  /** Match clock at End Match, seeds the result step's finish time. */
  initialFinishSeconds?: number;
  /** Records the match clock reading taken when the live step ended. */
  setFinishSeconds: (seconds: number) => void;
  refresh: () => void;
  /** The opponent cancelled before the match went live (weight or ready step). */
  onCancelledRemotely: (description?: string) => void;
}

export function MatchStepRenderer({
  step,
  exitHref,
  exitLabel,
  matchId,
  matchType,
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
  setStep,
  setStartedAt,
  setResultData,
  advanceToResult,
  initialFinishSeconds,
  setFinishSeconds,
  refresh,
  onCancelledRemotely,
}: MatchStepRendererProps) {
  // One recorder for the whole wizard, owned by MatchRecorderProvider above
  // this component; the live step drives it. The summary step's playback
  // affordance reads the match-keyed upload store instead, because the id
  // has to survive this subtree remounting (which the wizard does on every
  // match) and an upload that lands after the recorder that started it.
  const recorder = useMatchRecorder();
  const upload = useMatchUpload(matchId);

  if (step === "wait") {
    return <WaitStep message="Waiting for opponent..." allowSkip onSkip={() => setStep("weight")} />;
  }
  if (step === "weight") {
    return (
      <WeightStep
        matchId={matchId}
        onCancelledRemotely={onCancelledRemotely}
        currentDisplayName={me.display_name}
        currentWeight={me.current_weight}
        opponentDisplayName={opponent.display_name}
        opponentWeight={opponent.current_weight}
        currentElo={me.current_elo}
        opponentElo={opponent.current_elo}
        matchType={matchType}
        onConfirm={() => setStep("ready")}
      />
    );
  }
  if (step === "ready") {
    return (
      <ReadyStep
        exitHref={exitHref}
        onCancelledRemotely={onCancelledRemotely}
        matchId={matchId}
        currentAthleteId={me.athlete_id}
        opponentId={opponent.athlete_id}
        opponentName={opponent.display_name}
        onStarted={(s) => {
          setStartedAt(s);
          setStep("live");
        }}
      />
    );
  }
  if (step === "live") {
    return (
      <LiveStep
        matchId={matchId}
        matchType={matchType}
        opponentName={opponent.display_name}
        durationSeconds={durationSeconds}
        startedAt={startedAt}
        pausedAt={pausedAt}
        totalPausedDuration={totalPausedDuration}
        recorder={recorder}
        onEnded={(seconds) => {
          setFinishSeconds(seconds);
          setStep("end");
        }}
      />
    );
  }
  if (step === "end") {
    return <EndStep onAdvance={advanceToResult} />;
  }
  if (step === "result") {
    return (
      <ResultStep
        matchId={matchId}
        matchType={matchType}
        durationSeconds={durationSeconds}
        initialFinishSeconds={initialFinishSeconds}
        participants={[
          { id: me.athlete_id, displayName: me.display_name },
          { id: opponent.athlete_id, displayName: opponent.display_name },
        ]}
        submissionTypes={submissionTypes}
        onRecorded={(r) => {
          setResultData(r);
          setStep("confirm");
        }}
      />
    );
  }
  if (step === "confirm") {
    return (
      <ConfirmStep
        matchId={matchId}
        matchType={matchType}
        currentAthleteId={me.athlete_id}
        opponentId={opponent.athlete_id}
        opponentDisplayName={opponent.display_name}
        resultData={resultData}
        confirmedAthleteIds={confirmedAthleteIds}
        onCompleted={() => {
          refresh();
          setStep("summary");
        }}
      />
    );
  }
  if (step === "summary") {
    // For ranked matches the BE stamps authoritative elo_before / elo_after on
    // the participant when the result is recorded; `current_elo` is already the
    // post-match rating after refresh(), so we use the stamped fields directly
    // rather than re-deriving them (which would double-count the delta).
    const isRanked = matchType === "ranked";
    const eloBefore = isRanked ? me.elo_before : null;
    const eloAfter = isRanked ? me.elo_after : null;
    const eloDelta = isRanked ? me.elo_delta ?? null : null;
    // BE-stamped IBJJF division gap (same value for both athletes). Surfaced
    // only for ranked matches where it actually adjusts the phantom ELO.
    const weightDivisionGap = isRanked ? me.weight_division_gap ?? null : null;
    return (
      <SummaryStep
        matchId={matchId}
        exitHref={exitHref}
        exitLabel={exitLabel}
        matchType={matchType}
        matchStatus={matchStatus}
        outcome={ownOutcome}
        eloDelta={eloDelta}
        eloBefore={eloBefore}
        eloAfter={eloAfter ?? me.current_elo}
        weightDivisionGap={weightDivisionGap}
        videoId={upload?.videoId ?? null}
        videoPending={upload?.status === "uploading" || recorder.state === "stopping"}
        opponentId={opponent.athlete_id}
        opponentName={opponent.display_name}
      />
    );
  }
  return null;
}

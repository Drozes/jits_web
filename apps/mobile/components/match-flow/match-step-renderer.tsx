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

interface MatchParticipant {
  athlete_id: string;
  display_name: string;
  current_elo: number | null;
  current_weight: number | null;
  outcome: string | null;
  elo_before: number | null;
  elo_after: number | null;
  elo_delta: number | null;
}

interface MatchStepRendererProps {
  step: MatchStep;
  sessionId: string;
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
  setStep: (step: MatchStep) => void;
  setStartedAt: (s: string) => void;
  setResultData: (r: BroadcastResult) => void;
  advanceToResult: () => void;
  refresh: () => void;
}

export function MatchStepRenderer({
  step,
  sessionId,
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
  setStep,
  setStartedAt,
  setResultData,
  advanceToResult,
  refresh,
}: MatchStepRendererProps) {
  if (step === "wait") {
    return <WaitStep message="Waiting for opponent..." allowSkip onSkip={() => setStep("weight")} />;
  }
  if (step === "weight") {
    return (
      <WeightStep
        currentDisplayName={me.display_name}
        currentWeight={me.current_weight}
        opponentDisplayName={opponent.display_name}
        opponentWeight={opponent.current_weight}
        matchType={matchType}
        onConfirm={() => setStep("ready")}
      />
    );
  }
  if (step === "ready") {
    return (
      <ReadyStep
        sessionId={sessionId}
        matchId={matchId}
        currentAthleteId={me.athlete_id}
        opponentId={opponent.athlete_id}
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
        durationSeconds={durationSeconds}
        startedAt={startedAt}
        pausedAt={pausedAt}
        totalPausedDuration={totalPausedDuration}
        uploaderAthleteId={me.athlete_id}
        onEnded={() => setStep("end")}
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
        matchStatus={matchStatus}
        currentAthleteId={me.athlete_id}
        opponentId={opponent.athlete_id}
        opponentDisplayName={opponent.display_name}
        resultData={resultData}
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
    return (
      <SummaryStep
        sessionId={sessionId}
        matchType={matchType}
        matchStatus={matchStatus}
        outcome={ownOutcome}
        eloDelta={eloDelta}
        eloBefore={eloBefore}
        eloAfter={eloAfter ?? me.current_elo}
      />
    );
  }
  return null;
}

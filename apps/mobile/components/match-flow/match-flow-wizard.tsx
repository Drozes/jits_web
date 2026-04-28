import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { useMatchDetails } from "@/lib/match-flow/use-match-details";
import {
  getCurrentStep,
  MATCH_STEPS,
  type MatchStep,
} from "@/lib/match-flow/step-router";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { WeightStep } from "./steps/weight-step";
import { ReadyStep } from "./steps/ready-step";
import { LiveStep } from "./steps/live-step";
import { EndStep } from "./steps/end-step";
import { ResultStep } from "./steps/result-step";
import { ConfirmStep } from "./steps/confirm-step";
import { SummaryStep } from "./steps/summary-step";
import { WaitStep } from "./steps/wait-step";
import { WizardError, WizardLoading } from "./wizard-status";
import { QueueStatusBanner } from "./queue-status-banner";

interface MatchFlowWizardProps {
  sessionId: string;
  matchId: string;
  currentAthleteId: string;
}

const STEP_LABELS: Record<MatchStep, string> = {
  wait: "Waiting",
  weight: "Weights",
  ready: "Ready",
  live: "Live",
  end: "Ended",
  result: "Result",
  confirm: "Confirm",
  summary: "Summary",
};

/**
 * Top-level orchestrator for the 8-step session match wizard. Loads the
 * match + submission types, derives the initial step from match.status,
 * and renders one step at a time. Step components advance by calling
 * the wizard's step setter or by listening for broadcast / postgres
 * change events.
 */
export function MatchFlowWizard({ sessionId, matchId, currentAthleteId }: MatchFlowWizardProps) {
  const { match, submissionTypes, isLoading, error, refresh } = useMatchDetails(matchId);
  const [step, setStep] = React.useState<MatchStep | null>(null);
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
  const [resultData, setResultData] = React.useState<BroadcastResult | null>(null);

  // Derive the initial step from server status on first match load. We
  // only set if `step` is still null so a local advance doesn't get
  // overridden when the match details refetch.
  React.useEffect(() => {
    if (!match) return;
    setStep((prev) => prev ?? getCurrentStep(match));
    setStartedAt((prev) => prev ?? match.started_at);
  }, [match]);

  if (isLoading || !match || !step) return <WizardLoading />;
  if (error) return <WizardError sessionId={sessionId} title="Match unavailable" message={error} />;

  const me = match.participants.find((p) => p.athlete_id === currentAthleteId);
  const opponent = match.participants.find((p) => p.athlete_id !== currentAthleteId);
  if (!me || !opponent) return <WizardError sessionId={sessionId} title="Not a participant" />;

  const matchType = (match.match_type as "ranked" | "casual") ?? "casual";
  const stepIdx = MATCH_STEPS.indexOf(step);
  const ownOutcome = computeOwnOutcome(me.outcome, resultData, currentAthleteId);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-center text-xs text-muted-foreground">
        Step {stepIdx + 1} of {MATCH_STEPS.length} - {STEP_LABELS[step]}
      </Text>

      <QueueStatusBanner />

      {step === "wait" ? (
        <WaitStep message="Waiting for opponent..." allowSkip onSkip={() => setStep("weight")} />
      ) : null}

      {step === "weight" ? (
        <WeightStep
          currentDisplayName={me.display_name}
          currentWeight={me.current_weight}
          opponentDisplayName={opponent.display_name}
          opponentWeight={opponent.current_weight}
          matchType={matchType}
          onConfirm={() => setStep("ready")}
        />
      ) : null}

      {step === "ready" ? (
        <ReadyStep
          matchId={matchId}
          currentAthleteId={currentAthleteId}
          opponentId={opponent.athlete_id}
          onStarted={(s) => {
            setStartedAt(s);
            setStep("live");
          }}
        />
      ) : null}

      {step === "live" ? (
        <LiveStep
          matchId={matchId}
          matchType={matchType}
          durationSeconds={match.duration_seconds}
          startedAt={startedAt ?? match.started_at ?? new Date().toISOString()}
          pausedAt={match.paused_at}
          totalPausedDuration={match.total_paused_duration}
          onEnded={() => setStep("end")}
        />
      ) : null}

      {step === "end" ? <EndStep onAdvance={() => setStep("result")} /> : null}

      {step === "result" ? (
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
      ) : null}

      {step === "confirm" ? (
        <ConfirmStep
          matchId={matchId}
          matchType={matchType}
          matchStatus={match.status}
          currentAthleteId={currentAthleteId}
          opponentId={opponent.athlete_id}
          opponentDisplayName={opponent.display_name}
          resultData={resultData}
          onCompleted={() => {
            refresh();
            setStep("summary");
          }}
        />
      ) : null}

      {step === "summary" ? (
        <SummaryStep
          sessionId={sessionId}
          matchType={matchType}
          matchStatus={match.status}
          outcome={ownOutcome}
          eloDelta={matchType === "ranked" ? me.elo_delta ?? null : null}
        />
      ) : null}
    </ScrollView>
  );
}

function computeOwnOutcome(
  rowOutcome: string | null,
  resultData: BroadcastResult | null,
  currentAthleteId: string,
): "win" | "loss" | "draw" | null {
  if (rowOutcome === "win" || rowOutcome === "loss" || rowOutcome === "draw") return rowOutcome;
  if (!resultData) return null;
  if (resultData.result === "draw") return "draw";
  return resultData.winnerId === currentAthleteId ? "win" : "loss";
}

import * as React from "react";
import { ScrollView, Text } from "react-native";
import { useMatchDetails } from "@/lib/match-flow/use-match-details";
import {
  getCurrentStep,
  MATCH_STEPS,
  type MatchStep,
} from "@/lib/match-flow/step-router";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { WizardError, WizardLoading } from "./wizard-status";
import { QueueStatusBanner } from "./queue-status-banner";
import { MatchStepRenderer } from "./match-step-renderer";

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

/**
 * Top-level orchestrator for the 8-step session match wizard. Loads the
 * match + submission types, derives the initial step from match.status,
 * and renders one step at a time.
 */
export function MatchFlowWizard({ sessionId, matchId, currentAthleteId }: MatchFlowWizardProps) {
  const { match, submissionTypes, isLoading, error, refresh } = useMatchDetails(matchId);
  const [step, setStep] = React.useState<MatchStep | null>(null);
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
  const [resultData, setResultData] = React.useState<BroadcastResult | null>(null);

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
  const advanceToResult = React.useCallback(() => setStep("result"), []);

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
      <MatchStepRenderer
        step={step}
        sessionId={sessionId}
        matchId={matchId}
        matchType={matchType}
        matchStatus={match.status}
        durationSeconds={match.duration_seconds}
        startedAt={startedAt ?? match.started_at ?? new Date().toISOString()}
        pausedAt={match.paused_at}
        totalPausedDuration={match.total_paused_duration}
        me={me}
        opponent={opponent}
        submissionTypes={submissionTypes}
        resultData={resultData}
        ownOutcome={ownOutcome}
        setStep={setStep}
        setStartedAt={setStartedAt}
        setResultData={setResultData}
        advanceToResult={advanceToResult}
        refresh={refresh}
      />
    </ScrollView>
  );
}

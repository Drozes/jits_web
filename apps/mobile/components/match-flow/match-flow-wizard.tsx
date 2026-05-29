import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { cn } from "@/lib/cn";

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
  if (rowOutcome === "win" || rowOutcome === "loss" || rowOutcome === "draw") {
    return rowOutcome;
  }
  if (!resultData) return null;
  if (resultData.result === "draw") return "draw";
  return resultData.winnerId === currentAthleteId ? "win" : "loss";
}

/**
 * Top-level orchestrator for the 8-step session match wizard. Loads the
 * match + submission types, derives the initial step from match.status,
 * and renders one step at a time.
 *
 * ELO design system: page-tinted surface with a meta-strip progress
 * indicator (mirrors `apps/mobile/components/session/wizard-progress.tsx`
 * from the join wizard). The live step keeps the same scroll container
 * but its internal layout is full-bleed within the padding.
 */
export function MatchFlowWizard({
  sessionId,
  matchId,
  currentAthleteId,
}: MatchFlowWizardProps) {
  const insets = useSafeAreaInsets();
  const { match, submissionTypes, isLoading, error, refresh } = useMatchDetails(matchId);
  const [step, setStep] = React.useState<MatchStep | null>(null);
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
  const [resultData, setResultData] = React.useState<BroadcastResult | null>(null);

  React.useEffect(() => {
    if (!match) return;
    setStep((prev) => prev ?? getCurrentStep(match));
    setStartedAt((prev) => prev ?? match.started_at);
  }, [match]);

  const advanceToResult = React.useCallback(() => setStep("result"), []);

  if (isLoading || !match || !step) return <WizardLoading />;
  if (error) {
    return <WizardError sessionId={sessionId} title="Match unavailable" message={error} />;
  }

  const me = match.participants.find((p) => p.athlete_id === currentAthleteId);
  const opponent = match.participants.find((p) => p.athlete_id !== currentAthleteId);
  if (!me || !opponent) {
    return <WizardError sessionId={sessionId} title="Not a participant" />;
  }

  const matchType = (match.match_type as "ranked" | "casual") ?? "casual";
  const stepIdx = MATCH_STEPS.indexOf(step);
  const ownOutcome = computeOwnOutcome(me.outcome, resultData, currentAthleteId);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 32 + insets.bottom,
        gap: 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <WizardStepHeader currentIdx={stepIdx} label={STEP_LABELS[step]} />
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

/**
 * Step progress indicator for the match flow wizard. ELO meta-strip
 * with "STEP N / T" mono label, current-step name, and a row of
 * hairline bars that fill with the CTA color as the athlete advances.
 */
function WizardStepHeader({ currentIdx, label }: { currentIdx: number; label: string }) {
  const total = MATCH_STEPS.length;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Step {currentIdx + 1} / {total}
        </Text>
        <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
          {label}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: currentIdx + 1 }}
        accessibilityLabel="Match flow progress"
        className="flex-row gap-1"
      >
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={cn(
              "h-[3px] flex-1 rounded-none",
              i <= currentIdx ? "bg-cta" : "bg-surface-4",
            )}
          />
        ))}
      </View>
    </View>
  );
}

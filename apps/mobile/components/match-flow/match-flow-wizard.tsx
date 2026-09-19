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
import { MatchRecorderProvider } from "./match-recorder-context";
import { MatchRecorderCamera, MatchRecorderStatus } from "./match-recorder-surface";
import { cn } from "@/lib/cn";

interface MatchFlowWizardProps {
  /**
   * Where every exit in this wizard goes: the error / not-a-participant
   * splash, a cancelled ready check, and the summary step's primary cta.
   * The wizard has no session dependency (every RPC is keyed on `matchId`
   * and `matches.session_id` is nullable), so a match's origin only decides
   * where its exits point. A session match passes its lobby; a sessionless
   * match passes whatever surface it was started from.
   */
  exitHref: string;
  /**
   * Copy on the exit cta. Omitted, blank or whitespace-only falls back to
   * the session lobby wording: a default parameter only covers `undefined`,
   * and an empty label would render a tappable but visually blank cta that
   * is also unlabeled to VoiceOver / TalkBack. Callers that derive the label
   * from data (an opponent name, a gym name) can pass whatever they have.
   */
  exitLabel?: string;
  matchId: string;
  currentAthleteId: string;
  /** Reports the active wizard step so the screen can guard back-nav. */
  onStepChange?: (step: MatchStep | null) => void;
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
 * Top-level orchestrator for the 8-step match wizard. Loads the match +
 * submission types, derives the initial step from match.status, and
 * renders one step at a time.
 *
 * Origin-agnostic: it takes `exitHref` / `exitLabel` rather than a session
 * id, so it mounts unchanged for a match with no session at all.
 *
 * ELO design system: page-tinted surface with a meta-strip progress
 * indicator (mirrors `apps/mobile/components/session/wizard-progress.tsx`
 * from the join wizard). The live step keeps the same scroll container
 * but its internal layout is full-bleed within the padding.
 */
export function MatchFlowWizard({
  exitHref,
  exitLabel: rawExitLabel,
  matchId,
  currentAthleteId,
  onStepChange,
}: MatchFlowWizardProps) {
  // Single resolution point for the label: every downstream consumer takes a
  // required non-empty string, so blank and whitespace-only are normalised
  // here rather than defended against three times further down.
  const exitLabel = rawExitLabel?.trim() || "Back to Lobby";
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

  React.useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const advanceToResult = React.useCallback(() => setStep("result"), []);

  if (isLoading || !match || !step) return <WizardLoading />;
  if (error) {
    return (
      <WizardError
        exitHref={exitHref}
        exitLabel={exitLabel}
        title="Match unavailable"
        message={error}
      />
    );
  }

  const me = match.participants.find((p) => p.athlete_id === currentAthleteId);
  const opponent = match.participants.find((p) => p.athlete_id !== currentAthleteId);
  if (!me || !opponent) {
    return (
      <WizardError exitHref={exitHref} exitLabel={exitLabel} title="Not a participant" />
    );
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
      <MatchRecorderProvider
        matchId={matchId}
        uploaderAthleteId={me.athlete_id}
        matchDurationSeconds={match.duration_seconds}
      >
        <WizardStepHeader currentIdx={stepIdx} label={STEP_LABELS[step]} />
        <QueueStatusBanner />
        {/* Above the step, never inside one: the upload begins after the
            live step has already unmounted, so this is the only place its
            outcome (success, stall or failure) can be seen. jits-od3. */}
        <MatchRecorderStatus />
        <MatchRecorderCamera step={step} />
        <MatchStepRenderer
          step={step}
          exitHref={exitHref}
          exitLabel={exitLabel}
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
      </MatchRecorderProvider>
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

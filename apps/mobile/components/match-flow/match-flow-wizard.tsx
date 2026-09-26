import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMatchDetails } from "@/lib/match-flow/use-match-details";
import { MATCH_STEPS, type MatchStep } from "@/lib/match-flow/step-router";
import { useWizardSync } from "@/lib/match-flow/use-wizard-sync";
import { useMatchKeepAwake } from "@/lib/match-flow/use-keep-awake";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { WizardError, WizardLoading } from "./wizard-status";
import { QueueStatusBanner } from "./queue-status-banner";
import { MatchStepRenderer } from "./match-step-renderer";
import { MatchRecorderProvider, useMatchRecorder } from "./match-recorder-context";
import { MatchRecorderCamera, MatchRecorderStatus } from "./match-recorder-surface";
import { cn } from "@/lib/cn";
import { ARENA_EXIT_LABEL } from "@/lib/arena/constants";

interface MatchFlowWizardProps {
  /**
   * Where every exit in this wizard goes: the error / not-a-participant
   * splash, a cancelled ready check, and the summary step's primary cta.
   * The wizard has no session dependency (every RPC is keyed on `matchId`
   * and `matches.session_id` is nullable), so a match's origin only decides
   * where its exits point. On mobile every match starts in the Arena (there
   * are no gym sessions, jits-gewv), so the one caller passes the Arena.
   */
  exitHref: string;
  /**
   * Copy on the exit cta. Omitted, blank or whitespace-only falls back to
   * the Arena wording (`ARENA_EXIT_LABEL`): a default parameter only covers `undefined`,
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

export const STEP_LABELS: Record<MatchStep, string> = {
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
 * indicator. The live step keeps the same scroll container
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
  const exitLabel = rawExitLabel?.trim() || ARENA_EXIT_LABEL;
  const insets = useSafeAreaInsets();
  const { match, submissionTypes, isLoading, error, refresh, applyMatch } =
    useMatchDetails(matchId);
  const isParticipant =
    !!match &&
    match.participants.some((p) => p.athlete_id === currentAthleteId) &&
    match.participants.some((p) => p.athlete_id !== currentAthleteId);
  // Step state + the DB reconciler that keeps it honest when a broadcast is
  // missed (jits-wfpo, -bh2v, -vh7m, -bmei, -mzfu). See use-wizard-sync.ts.
  const {
    step,
    setStep,
    startedAt,
    setStartedAt,
    resultData,
    setResultData,
    confirmedAthleteIds,
    exitCancelled,
    stopRecorderRef,
    syncContext,
  } = useWizardSync({
    matchId,
    currentAthleteId,
    exitHref,
    match,
    ready: isParticipant && !error,
    applyMatch,
    refresh,
  });

  React.useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Screen wake-lock for every step the recorder camera is up, not just
  // live. The ready check shows the preview and the phone is typically
  // already propped against the wall; auto-lock there tore the capture
  // session down and nothing was recorded. Owned here, once, rather than
  // per step: two holders of the one lock tag would release it for each
  // other on the ready -> live handoff.
  useMatchKeepAwake(step === "ready" || step === "live");

  const advanceToResult = React.useCallback(() => setStep("result"), [setStep]);

  // The match clock when the live step ended, keyed to its match so a later
  // match never inherits it. Only set by ending live on this device: a cold
  // start or re-entry straight into result has no reading and stays empty.
  const [clockFinish, setClockFinish] = React.useState<{ matchId: string; seconds: number } | null>(
    null,
  );
  const setFinishSeconds = React.useCallback(
    (seconds: number) => setClockFinish({ matchId, seconds }),
    [matchId],
  );
  const initialFinishSeconds = clockFinish?.matchId === matchId ? clockFinish.seconds : undefined;

  // LOAD-BEARING. Do not delete this as a mere optimisation.
  //
  // The confirm step calls refresh() the instant the row completes, which
  // re-enters useMatchDetails' loading state while the already-loaded match
  // is still in hand. Treating that as a first load blanks the whole wizard
  // to the loading splash on EVERY match and remounts the recorder with it.
  //
  // The UPLOAD outcome survives such a remount by itself, because it lives
  // in the match-keyed store rather than here. RECORDER-ONLY failures do
  // NOT: "Camera not ready", "Camera permission required", "Recording
  // failed", "Stop failed", the stop watchdog's "The recording did not
  // finish", and a cap fire that produced no file, all live on the recorder
  // and never reach the store, because no upload was ever attempted. A
  // remount replaces the recorder with a fresh idle one and every one of
  // those messages disappears, on the summary step, which is the one place
  // jits-od3 requires them to be visible.
  //
  // So this predicate is what keeps that class alive, and
  // upload-survives-remount.test.tsx has a suite that fails if it is
  // removed. Distinguish a revalidation of THIS match from a genuine first
  // load, or a load for a DIFFERENT matchId.
  const revalidating = isLoading && match != null && match.id === matchId;

  // The error guard runs FIRST, above the loading guard, and has to.
  //
  // `getMatchDetails` returns null on any failure, and on a FIRST load
  // `useMatchDetails` turns that into `{ match: null, error: "Match not
  // found" }` (its catch branch does the same with the thrown message). A
  // failed RE-fetch of the match already in hand sets neither: it keeps the
  // loaded match, so a blip after the result lands cannot replace the
  // summary with this splash. So on a FIRST-load failure `error` is
  // set and `match` is still null, and with the loading guard first the
  // `!match` term won and `WizardError` was unreachable: the user sat on a
  // permanent "Loading match..." spinner for a match that had already
  // failed to load, with no exit cta.
  //
  // Nothing else changes order. When `match` IS in hand, `error` already
  // outranked the render below, because the loading guard fell through.
  // And `error` cannot be set while revalidating: the hook clears it
  // (`setError(null)`) synchronously as each fetch begins.
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
  if ((isLoading && !revalidating) || !match || !step) return <WizardLoading />;

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
        <MatchSyncProvider value={syncContext}>
          <RecorderStopBridge stopRef={stopRecorderRef} />
          <WizardStepHeader step={step} currentIdx={stepIdx} label={STEP_LABELS[step]} />
          <QueueStatusBanner />
          {/* Above the step, never inside one: the upload begins after the
              live step has already unmounted, so this is the only place its
              outcome (success, stall or failure) can be seen. jits-od3. */}
          <MatchRecorderStatus matchId={matchId} />
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
            confirmedAthleteIds={confirmedAthleteIds}
            setStep={setStep}
            setStartedAt={setStartedAt}
            setResultData={setResultData}
            advanceToResult={advanceToResult}
            initialFinishSeconds={initialFinishSeconds}
            setFinishSeconds={setFinishSeconds}
            refresh={refresh}
            onCancelledRemotely={exitCancelled}
          />
        </MatchSyncProvider>
      </MatchRecorderProvider>
    </ScrollView>
  );
}

/**
 * Step progress indicator for the match flow wizard. ELO meta-strip
 * with "STEP N / T" mono label, current-step name, and a row of
 * hairline bars that fill with the CTA color as the athlete advances.
 */
export function WizardStepHeader({
  step,
  currentIdx,
  label,
}: {
  step: MatchStep;
  currentIdx: number;
  label: string;
}) {
  const total = MATCH_STEPS.length;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text
          testID={`match-step-${step}`}
          accessibilityLabel={`Step ${currentIdx + 1} of ${total}, ${label}`}
          className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl"
        >
          Step {currentIdx + 1} / {total}
        </Text>
        {/* The step marker's label already says the step name; hide this
            visual duplicate from VoiceOver so it is not read twice. */}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l"
        >
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

/**
 * Hands the wizard-level sync hook a way to stop the recorder, which lives
 * in the provider rendered BELOW that hook. When the reconciler moves the
 * wizard off the live step (the opponent recorded while our `match_ended`
 * was lost), the recorder has to enter `stopping` in the same tick as the
 * step change, or the camera surface unmounts under a running recording.
 */
function RecorderStopBridge({
  stopRef,
}: {
  stopRef: React.MutableRefObject<(() => void) | null>;
}) {
  const recorder = useMatchRecorder();
  React.useEffect(() => {
    stopRef.current = () => {
      void recorder.stop();
    };
    return () => {
      stopRef.current = null;
    };
  }, [recorder, stopRef]);
  return null;
}

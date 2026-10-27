import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMatchDetails } from "@/lib/match-flow/use-match-details";
import { MATCH_STEPS, type MatchStep } from "@/lib/match-flow/step-router";
import { useWizardSync } from "@/lib/match-flow/use-wizard-sync";
import { useMatchKeepAwake } from "@/lib/match-flow/use-keep-awake";
import { useTimekeeperPresence } from "@/lib/match-flow/use-timekeeper-presence";
import { useLiveEndHold } from "@/lib/match-flow/use-live-end-hold";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { readMatchExtras } from "@/lib/match-flow/match-extras";
import { consentedIn, useAiConsent, useEffectiveRecordingOptIn } from "@/lib/moderation/ai-consent";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { capturePolicyFor } from "@/lib/match-flow/capture-policy";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { computeOwnOutcome } from "@/lib/match-flow/compute-own-outcome";
import { useWizardWeights } from "@/lib/match-flow/use-wizard-weights";
import { WizardError, WizardLoading } from "./wizard-status";
import { QueueStatusBanner } from "./queue-status-banner";
import { MatchStepRenderer } from "./match-step-renderer";
import { MatchRecorderProvider, useMatchRecorder } from "./match-recorder-context";
import { MatchRecorderCamera } from "./match-recorder-surface";
import { MatchOrientationController, orientationModeFor } from "./match-orientation-controller";
import { FaceoffProvider } from "./faceoff/faceoff-context";
import { FaceoffTop } from "./faceoff/faceoff-top";
import { FaceoffTimekeeperTop } from "./faceoff/faceoff-timekeeper";
import { usePalette } from "@/lib/theme/palette";
import { BROADCAST } from "./live/broadcast-tokens";
import { WizardScrollContext, useWizardScrollSource } from "./wizard-scroll";
import { ARENA_EXIT_LABEL } from "@/lib/arena/constants";
import { cn } from "@/lib/cn";

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

/** The step names in the step marker label the match-loop harness reads (`StepMarker`). */
const STEP_LABELS: Record<MatchStep, string> = {
  crew: "Crew",
  weight: "Weights",
  ready: "Ready",
  live: "Live",
  end: "Ended",
  result: "Result",
  confirm: "Confirm",
  summary: "Summary",
};

/**
 * Top-level orchestrator for the match wizard (steps in `step-router.ts`).
 * Loads the match + submission types, derives the initial step from
 * match.status, and renders one step at a time.
 *
 * Origin-agnostic: it takes `exitHref` / `exitLabel` rather than a session
 * id, so it mounts unchanged for a match with no session at all.
 *
 * ELO design system: page-tinted surface with no visible step progress (the
 * harness reads `StepMarker`). The live step keeps the same scroll container
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
  const palette = usePalette();
  // The verdict turns its status bar back to the theme once its hero scrolls away.
  const wizardScroll = useWizardScrollSource();
  // "Record from my phone" only counts with AI processing consent (5.1.2(i)).
  const recordingOptIn = useEffectiveRecordingOptIn(currentAthleteId);
  const aiConsent = useAiConsent();
  const { match, submissionTypes, isLoading, error, refresh, applyMatch } =
    useMatchDetails(matchId);
  // Mode and role, derived once per match in hand (match-roles.ts). Null
  // while loading, and for a viewer who has no role in it (neither one of
  // its two athletes nor a timekeeper-mode match's seated timekeeper).
  const roles = React.useMemo(
    () => (match ? deriveMatchRoles(match, currentAthleteId) : null),
    [match, currentAthleteId],
  );
  // Whether this phone records the match: the camera warms on it and the
  // live step arms the recorder. An athlete's own "Record from my phone", as
  // always. The timekeeper always records (D12, `caps.recordingRequired`),
  // whatever the device toggle says, but still only with AI processing
  // consent (5.1.2(i)) to the timekeeper text: without it the timekeeper's
  // camera gate asks first.
  const consented = consentedIn(aiConsent, currentAthleteId, "timekeeper");
  const recording = recordingOptIn || (roles?.caps.recordingRequired === true && consented);
  // Step state + the DB reconciler that keeps it honest when a broadcast is
  // missed (jits-wfpo, -bh2v, -vh7m, -bmei, -mzfu). See use-wizard-sync.ts.
  const {
    step: syncedStep,
    setStep,
    startedAt,
    setStartedAt,
    resultData,
    setResultData,
    confirmedAthleteIds,
    exitCancelled,
    stopRecorderRef,
    syncContext,
    tkState,
  } = useWizardSync({
    matchId,
    currentAthleteId,
    exitHref,
    match,
    ready: roles != null && !error,
    applyMatch,
    refresh,
  });
  // The step on screen: a timekeeper-mode athlete's ended plate stays up for
  // a moment after the DB moves them to the result (spec 4.2 End,
  // `useLiveEndHold`); every other phone shows the wizard's step as it is.
  const step = useLiveEndHold(syncedStep, roles?.caps.endVia === null);

  React.useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // The weights this match is rated on, for the face-off and the countdown.
  // Read here, above the early returns, for hook order. The athletes' reads
  // only: the timekeeper can read neither the challenge row (RLS) nor the
  // weight checks (participants only), and takes the rated weights and the
  // checks from the timekeeper-mode state (PM26, `stepSeams`).
  const { weights, weightChecks } = useWizardWeights({
    matchId,
    challengeId: roles != null && roles.me == null ? null : match?.challenge_id,
    viewerId: currentAthleteId,
    roles,
    checksEnabled: roles?.me != null && !error && !!match?.challenge_id && (step === "weight" || step === "ready"),
  });

  // The step the camera follows. The timekeeper's one face-off screen is the
  // `weight` step (spec 6.2), and it holds the camera the athletes' ready
  // step holds (preview, wake-lock, orientation), so the camera is warm
  // before their Start. While the match is pending or in progress: the match
  // in hand may turn in_progress a render before the step turns live, and
  // the capture session must stay up across that ready -> live handoff. Not
  // for a cancelled (or finished) match, which also mounts on `weight` until
  // its first snapshot exits it.
  const timekeeperFaceoff =
    step === "weight" &&
    roles != null &&
    roles.me == null &&
    (match?.status === "pending" || match?.status === "in_progress");
  const cameraStep: MatchStep | null = timekeeperFaceoff ? "ready" : step;

  // Screen wake-lock for every step the recorder camera is up, not just
  // live. The ready check shows the preview and the phone is typically
  // already propped against the wall; auto-lock there tore the capture
  // session down and nothing was recorded. Owned here, once, rather than
  // per step: two holders of the one lock tag would release it for each
  // other on the ready -> live handoff. Held on live even when not
  // recording: the clock is on screen for the whole round.
  useMatchKeepAwake(cameraStep === "ready" || cameraStep === "live");

  // The seated timekeeper's 15 s heartbeat, from the seat to the result
  // (timekeeper mode R23; spec 4.3): once here, so it spans every step.
  useTimekeeperPresence(
    matchId,
    roles?.viewer === "timekeeper" && (match?.status === "pending" || match?.status === "in_progress"),
  );

  // Live shrinks the content to the viewport with scrolling off. Reset any
  // offset left from scrolling the ready step, or every full-screen layer
  // would sit shifted up with no way to scroll it back. scrollTo keeps the
  // tree as is, so the camera is not remounted.
  const scrollRef = React.useRef<ScrollView>(null);
  React.useEffect(() => {
    // The verdict too: its hero, and its status bar over it, start at y 0
    // (VerdictStep's pastHero starts false), never at the offset the
    // confirm or result step left behind.
    if (step === "live" || step === "summary") scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

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

  if (!roles) {
    return (
      <WizardError exitHref={exitHref} exitLabel={exitLabel} title="Not a participant" />
    );
  }
  // Null for the timekeeper of a timekeeper-mode match, who is in the match
  // but is neither athlete: no athlete face-off, outcome or verdict.
  const me = roles.me;
  const opponent = roles.opponent;
  // How this viewer records: the orientation, the preview and the lens (A21).
  const capture = capturePolicyFor(roles);

  const ownOutcome = me ? computeOwnOutcome(me, resultData) : null;
  const extras = readMatchExtras(match);
  // Live is a full-screen broadcast layout over the camera, and the verdict
  // runs its hero edge to edge. The ScrollView and every slot stay in place
  // (hidden slots render null) so the camera element keeps its position and
  // the capture session is never remounted.
  const live = step === "live";
  const fullBleed = live || step === "summary";
  const faceoff = step === "weight" || step === "ready";
  // The athletes' face-off (its channel, ready handshake and auto-start);
  // the timekeeper's face-off is its own screen.
  const athleteFaceoff = faceoff && me != null && opponent != null;

  return (
    <MatchFlowProvider match={match} roles={roles} tkState={tkState}>
      <WizardScrollContext.Provider value={wizardScroll.value}>
        <ScrollView
          ref={scrollRef}
          onScroll={step === "summary" ? wizardScroll.onScroll : undefined}
          scrollEventThrottle={32}
          style={{ flex: 1, backgroundColor: live ? BROADCAST.black : palette.bg }}
          scrollEnabled={!live}
          contentContainerStyle={
            fullBleed
              ? { flexGrow: 1 }
              : {
                  padding: 16,
                  paddingTop: insets.top + 8,
                  // Landscape ready check: clear the sensor housing and corners.
                  paddingLeft: Math.max(16, insets.left),
                  paddingRight: Math.max(16, insets.right),
                  paddingBottom: 32 + insets.bottom,
                  gap: 16,
                }
          }
          keyboardShouldPersistTaps="handled"
        >
          <MatchRecorderProvider
            matchId={matchId}
            uploaderAthleteId={me?.athleteId ?? currentAthleteId}
            matchDurationSeconds={match.duration_seconds}
          >
            <MatchSyncProvider value={syncContext}>
              <FaceoffProvider
                active={athleteFaceoff}
                phase={athleteFaceoff && faceoff ? step : null}
                matchId={matchId}
                exitHref={exitHref}
                meId={me?.athleteId ?? currentAthleteId}
                opponentId={opponent?.athleteId ?? ""}
                myWeight={weights.mine}
                opponentWeight={weights.theirs}
                weightsRated={weights.rated}
                weightChecks={weightChecks}
                onWeighedIn={() => setStep("ready")}
                onStarted={(s) => {
                  setStartedAt(s);
                  setStep("live");
                }}
                onCancelledRemotely={exitCancelled}
                flow={{ match, roles, tkState }}
              >
                <RecorderStopBridge stopRef={stopRecorderRef} />
                {/* Before the step renderer so the live lock lands before recording starts. */}
                <MatchOrientationController
                  mode={orientationModeFor(cameraStep)}
                  recordingOrientation={capture.recordingOrientation}
                />
                <StepMarker step={step} />
                {live ? null : <QueueStatusBanner />}
                {faceoff ? (
                  me && opponent ? (
                    <FaceoffTop phase={step} me={me} opponent={opponent} />
                  ) : (
                    <FaceoffTimekeeperTop />
                  )
                ) : null}
                <MatchRecorderCamera step={cameraStep} optedIn={recording} capture={capture} matchId={matchId} />
                <MatchStepRenderer
                  step={step}
                  exitHref={exitHref}
                  exitLabel={exitLabel}
                  matchId={matchId}
                  matchStatus={match.status}
                  durationSeconds={match.duration_seconds}
                  startedAt={startedAt ?? match.started_at ?? new Date().toISOString()}
                  pausedAt={match.paused_at}
                  totalPausedDuration={match.total_paused_duration}
                  submissionTypes={submissionTypes}
                  resultData={resultData}
                  ownOutcome={ownOutcome}
                  confirmedAthleteIds={confirmedAthleteIds}
                  extras={extras}
                  recording={recording}
                  matchWeights={weights}
                  setStep={setStep}
                  setResultData={setResultData}
                  advanceToResult={advanceToResult}
                  initialFinishSeconds={initialFinishSeconds}
                  setFinishSeconds={setFinishSeconds}
                  refresh={refresh}
                />
              </FaceoffProvider>
            </MatchSyncProvider>
          </MatchRecorderProvider>
        </ScrollView>
      </WizardScrollContext.Provider>
    </MatchFlowProvider>
  );
}

/**
 * The wizard's step, for the match-loop harness. The visible "STEP N / T"
 * header is gone (the redesign has no step progress), but the harness reads
 * the step from this element: PRIMARILY by the step name in its accessibility
 * label ("Step N of T, <Label>"), because idb does not reliably surface a
 * testID (`tools/match-loop/sim/screens.ts` currentStep), with
 * `match-step-<step>` as the fallback. So it cannot simply be hidden from the
 * accessibility tree.
 *
 * The harness drives a Metro dev build, so the marker is an accessibility
 * element only in `__DEV__`; release builds hide it (and its label) from
 * VoiceOver / TalkBack, where it would be a stray, invisible stop.
 */
export function StepMarker({ step, exposed = __DEV__ }: { step: MatchStep; exposed?: boolean }) {
  const idx = MATCH_STEPS.indexOf(step);
  return (
    <View
      testID={`match-step-${step}`}
      accessible={exposed}
      accessibilityLabel={exposed ? `Step ${idx + 1} of ${MATCH_STEPS.length}, ${STEP_LABELS[step]}` : undefined}
      accessibilityElementsHidden={!exposed}
      importantForAccessibility={exposed ? "yes" : "no-hide-descendants"}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1 }}
    />
  );
}

/**
 * Step progress indicator, now used by the practice match only (the real
 * match flow dropped the visible step header; see StepMarker), which passes
 * its own steps (`PRACTICE_STEPS`). ELO meta-strip with "STEP N / T" mono
 * label, current-step name, and a row of hairline bars that fill with the
 * CTA color as the athlete advances.
 */
export function WizardStepHeader({
  step,
  currentIdx,
  total,
  label,
}: {
  /** The step's slug, for the `match-step-<step>` testID. */
  step: string;
  currentIdx: number;
  total: number;
  label: string;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text
          testID={`match-step-${step}`}
          accessibilityLabel={`Step ${currentIdx + 1} of ${total}, ${label}`}
          className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl"
        >
          Step {currentIdx + 1} / {total}
        </Text>
        {/* The step marker's label already says the step name; hide this
            visual duplicate from VoiceOver so it is not read twice. */}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          className="font-mono tabular-nums text-micro text-ink-2 uppercase tracking-caps-l"
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

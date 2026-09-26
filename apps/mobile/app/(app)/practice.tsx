/**
 * Practice match (jr_be spec 014): one scripted Arena match against a local
 * bot. Client-side only. It never writes challenges, matches, results,
 * confirmations or videos; the only network write is `markPracticeMatch`
 * (fire and forget). The clip, if recorded, never leaves the phone.
 *
 * Back and Exit work at every phase with no confirm: nothing can be orphaned.
 */
import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSubmissionTypes } from "@jits/shared/api/queries";
import { markPracticeMatch, type PracticeMatchEvent } from "@jits/shared/api/mutations";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { supabase } from "@/lib/supabase/client";
import { useAuth, useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { AppHeader } from "@/components/layout/app-header";
import { MetaTag } from "@/components/ui/elo-system";
import { STEP_LABELS, WizardStepHeader } from "@/components/match-flow/match-flow-wizard";
import { MatchRecorderProvider, useMatchRecorder } from "@/components/match-flow/match-recorder-context";
import { MatchRecorderCamera } from "@/components/match-flow/match-recorder-surface";
import { PracticeButton, PracticeTip } from "@/components/practice/practice-steps";
import { PracticePhaseView } from "@/components/practice/practice-phase";
import { usePracticeMatch } from "@/lib/practice/use-practice-match";
import {
  PRACTICE_DURATION_SECONDS,
  PRACTICE_RECORDER_ID,
  PRACTICE_TIPS,
  type PracticePhase,
} from "@/lib/practice/constants";
import { MATCH_STEPS, type MatchStep } from "@/lib/match-flow/step-router";
import { useArenaMatchScreen } from "@/lib/arena/arena-store";
import { useMatchKeepAwake } from "@/lib/match-flow/use-keep-awake";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { ARENA_HREF } from "@/lib/arena/constants";
import { discardLocalClip } from "@/lib/video/recording-file";

/**
 * Waiting and every phase from weight on share the real wizard step's name
 * and header, so the count starts at Step 1 / 8.
 */
function stepFor(phase: PracticePhase): MatchStep | null {
  if (phase === "waiting") return "wait";
  return (MATCH_STEPS as readonly string[]).includes(phase)
    ? (phase as MatchStep)
    : null;
}

/** Deletes the run's clip when the recorder goes away (exit, back, Practice again). */
function PracticeClipCustodian() {
  const { localUri } = useMatchRecorder();
  const uriRef = React.useRef(localUri);
  uriRef.current = localUri;
  React.useEffect(() => () => discardLocalClip(uriRef.current), []);
  return null;
}

export default function PracticeScreen() {
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { athlete } = useRequireAthlete();
  const { refreshAthleteSoft } = useAuth();
  const { state, dispatch } = usePracticeMatch();
  const { phase } = state;
  const [run, setRun] = React.useState(0);
  const [submissionTypes, setSubmissionTypes] = React.useState<SubmissionType[]>([]);

  // Offline for the run and no real challenge prompt over it, like a match.
  useArenaMatchScreen();
  useMatchKeepAwake(phase === "ready" || phase === "live");

  const mark = React.useCallback(
    (event: PracticeMatchEvent) => {
      void markPracticeMatch(supabase, event)
        .then((r) => {
          if (!r.ok) console.warn(`[practice] mark ${event} failed: ${r.error.message}`);
          return refreshAthleteSoft();
        })
        .catch(() => undefined);
    },
    [refreshAthleteSoft],
  );

  // Once per mount, whichever entry point (Home card or Settings) opened it.
  const offeredRef = React.useRef(false);
  React.useEffect(() => {
    if (offeredRef.current) return;
    offeredRef.current = true;
    mark("offered");
  }, [mark]);

  // Read-only. If it fails, only a draw can be recorded.
  React.useEffect(() => {
    let cancelled = false;
    getSubmissionTypes(supabase)
      .then((types) => !cancelled && setSubmissionTypes(types))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const completedRunRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (phase !== "summary" || completedRunRef.current === run) return;
    completedRunRef.current = run;
    mark("completed");
  }, [phase, run, mark]);

  const exit = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else exitMatchTo(router, "/");
  }, [router]);
  const again = React.useCallback(() => {
    dispatch({ type: "RESET" });
    setRun((n) => n + 1); // Remounts the recorder; its custodian deletes the clip.
  }, [dispatch]);

  if (!athlete) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={tokens.textSecondary} />
      </View>
    );
  }

  const step = stepFor(phase);
  const tip = PRACTICE_TIPS[phase];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-surface">
        <AppHeader title="Practice Match" back backFallback="/" liveSignal="static" />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <MatchRecorderProvider
            key={run}
            matchId={PRACTICE_RECORDER_ID}
            uploaderAthleteId={athlete.id}
            matchDurationSeconds={PRACTICE_DURATION_SECONDS}
            upload={false}
          >
            <PracticeClipCustodian />
            <MetaTag accessibilityLabel="Practice match" testID="practice-tag">
              Practice
            </MetaTag>
            {step ? (
              <WizardStepHeader
                step={step}
                currentIdx={MATCH_STEPS.indexOf(step)}
                label={STEP_LABELS[step]}
              />
            ) : null}
            {tip ? <PracticeTip text={tip} /> : null}
            <MatchRecorderCamera step={step ?? "wait"} />
            <PracticePhaseView
              state={state}
              dispatch={dispatch}
              athlete={athlete}
              submissionTypes={submissionTypes}
              onArena={() => exitMatchTo(router, ARENA_HREF)}
              onDone={exit}
              onAgain={again}
            />
            {phase === "summary" ? null : (
              <PracticeButton
                testID="practice-exit"
                label="Exit practice"
                variant="tertiary"
                onPress={exit}
              />
            )}
          </MatchRecorderProvider>
        </ScrollView>
      </View>
    </>
  );
}

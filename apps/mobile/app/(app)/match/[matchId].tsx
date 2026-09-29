/**
 * A match with no session behind it.
 *
 * This is where the Arena handshake lands both parties. The wizard needs only
 * a match id (`matches.session_id` is nullable and every RPC it calls is keyed
 * on the match), so mounting it here inherits the whole flow, camera included:
 * the live step is what owns recording, upload and playback, and none of that
 * is duplicated for the Arena.
 *
 * The route is deliberately generic rather than `/arena/match/[matchId]`: a
 * sessionless match is a match, and the only Arena-specific thing about it is
 * where its exits point.
 */
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { AppHeader } from "@/components/layout/app-header";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";
import { useArenaMatchScreen } from "@/lib/arena/arena-store";

/**
 * Steps where a live match is in flight and leaving via a back gesture would
 * orphan it `in_progress` with no resume path.
 */
const GUARDED_STEPS: ReadonlySet<MatchStep> = new Set<MatchStep>([
  "live",
  "end",
  "result",
  "confirm",
]);

/**
 * The face-off: no swipe back either (leaving there without cancelling left
 * the match pending with nobody in it, jits-bh2v). Not a preventRemove
 * guard, so the face-off's own exits (Leave, a remote cancel) still
 * navigate; its Leave control and Android back both confirm and cancel.
 */
const NO_SWIPE_STEPS: ReadonlySet<MatchStep> = new Set<MatchStep>(["weight", "ready"]);

export default function ArenaMatchScreen() {
  const tokens = useThemedTokens();
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const [step, setStep] = React.useState<MatchStep | null>(null);
  // Offline for the match, no challenge prompts over it, and back to live on
  // the way out (every exit path unmounts this screen). See arena-store.ts.
  useArenaMatchScreen(matchId);

  // "Leave and confirm later": lift the guard, then exit once it is off.
  const [leaving, setLeaving] = React.useState(false);
  const guarded = step != null && GUARDED_STEPS.has(step) && !leaving;
  usePreventRemove(guarded, () => {});
  React.useEffect(() => {
    if (leaving) exitMatchTo(router, ARENA_HREF);
  }, [leaving, router]);
  const onLeaveMatch = React.useCallback(() => setLeaving(true), []);
  const swipeable = !guarded && !(step != null && NO_SWIPE_STEPS.has(step));

  if (authLoading || !athlete) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 bg-surface">
          <AppHeader title="Match" />
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={tokens.textSecondary} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: swipeable }} />
      {/* The match flow follows the app theme; only the camera screens
          (countdown, live) are dark and turn the status bar light while they
          are up. Once a step is up the steps carry their own chrome (the
          face-off's Leave, the verdict's exits), so the app header shows only
          while the match loads. Its slot stays in place (null) so nothing
          below it moves in the tree. */}
      <ThemedStatusBar />
      <View className="flex-1 bg-surface" style={step === "live" ? { backgroundColor: BROADCAST.black } : undefined}>
        {step == null ? <AppHeader title="Match" /> : null}
        {/* The wizard derives its own starting step from `matches.status`, so
            backgrounding and reopening mid-match resumes where it left off. */}
        <MatchFlowWizard
          exitHref={ARENA_HREF}
          exitLabel={ARENA_EXIT_LABEL}
          matchId={matchId}
          currentAthleteId={athlete.id}
          onStepChange={setStep}
          onLeaveMatch={onLeaveMatch}
        />
      </View>
    </>
  );
}

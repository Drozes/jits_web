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
 *
 * `/match/<id>` resolves here (`match/[matchId]/index`): the folder also holds
 * `match/[matchId]/timekeep`, the asked person's sheet in timekeeper mode
 * (spec 8, `timekeep_href`). The URL, every `exitMatchTo` target and the
 * push `match_href` are unchanged by the folder.
 */
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { ThemedStatusBar } from "@/lib/theme/themed-status-bar";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";
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
 * The face-off, and timekeeper mode's pick before it (`crew`): no swipe back
 * either (leaving there without cancelling left the match pending with
 * nobody in it, jits-bh2v). Not a preventRemove guard, so their own exits
 * (Leave, a remote cancel) still navigate; an athlete's Leave control and
 * Android back both confirm and cancel (the face-off's `FaceoffTop`, the
 * crew step's `useCrewLeave`, spec 4.3). The timekeeper's face-off Leave is
 * a drop-out, not a cancel (TK-K14, slices M3 and M4).
 */
const NO_SWIPE_STEPS: ReadonlySet<MatchStep> = new Set<MatchStep>(["crew", "weight", "ready"]);

export default function ArenaMatchScreen() {
  const tokens = useThemedTokens();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const [step, setStep] = React.useState<MatchStep | null>(null);
  // Offline for the match, no challenge prompts over it, and back to live on
  // the way out (every exit path unmounts this screen). See arena-store.ts.
  useArenaMatchScreen(matchId);

  // No in-app "leave and confirm later" exit (jits-02vo.7): closing the app
  // is allowed, and the backend confirms an undisputed result once its lock
  // window passes (jr_be-ahn.5).
  const guarded = step != null && GUARDED_STEPS.has(step);
  usePreventRemove(guarded, () => {});
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
        />
      </View>
    </>
  );
}

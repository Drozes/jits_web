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
import { Stack, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { AppHeader } from "@/components/layout/app-header";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";

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

export default function ArenaMatchScreen() {
  const tokens = useThemedTokens();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const [step, setStep] = React.useState<MatchStep | null>(null);

  const guarded = step != null && GUARDED_STEPS.has(step);
  usePreventRemove(guarded, () => {});

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
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !guarded }} />
      <View className="flex-1 bg-surface">
        <AppHeader title="Match" />
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

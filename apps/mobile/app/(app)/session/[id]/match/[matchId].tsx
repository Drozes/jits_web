import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { AppHeader } from "@/components/layout/app-header";

/**
 * Live match flow screen, renders the 8-step wizard for an in-session
 * match. Auth-gated by `useRequireAthlete`. The wizard handles its own
 * loading + error states once an athlete is in scope.
 *
 * ELO design system: native stack header is suppressed so we can mount
 * the `AppHeader` directly above the wizard. The header purposefully
 * hides the back button: leaving the match mid-flow needs to go through
 * the dispute / cancel ctas, not a navigation gesture.
 */
export default function SessionMatchScreen() {
  const tokens = useThemedTokens();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();

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
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 bg-surface">
        <AppHeader title="Match" />
        <MatchFlowWizard
          sessionId={id}
          matchId={matchId}
          currentAthleteId={athlete.id}
        />
      </View>
    </>
  );
}

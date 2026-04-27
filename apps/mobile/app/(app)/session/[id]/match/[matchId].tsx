import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";

/**
 * Live match flow screen -- renders the 8-step wizard for an in-session
 * match. Auth-gated by `useRequireAthlete`. The wizard handles its own
 * loading + error states once an athlete is in scope.
 */
export default function SessionMatchScreen() {
  const tokens = useThemedTokens();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { athlete, isLoading: authLoading } = useRequireAthlete();

  if (authLoading || !athlete) {
    return (
      <>
        <Stack.Screen options={{ title: "Match", headerBackVisible: false }} />
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator color={tokens.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Match", headerBackVisible: false }} />
      <MatchFlowWizard
        sessionId={id}
        matchId={matchId}
        currentAthleteId={athlete.id}
      />
    </>
  );
}

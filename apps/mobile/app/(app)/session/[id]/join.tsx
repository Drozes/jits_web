import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useSessionForJoin } from "@/lib/session/use-session-for-join";
import { JoinWizard } from "@/components/session/join-wizard";

export default function SessionJoinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, activeWaiverId, alreadyParticipant, isLoading, error } =
    useSessionForJoin(id, athlete?.id);

  // If the athlete already has a non-finished participant row, send them
  // straight to the lobby (mirrors web's redirect in JoinContent).
  React.useEffect(() => {
    if (alreadyParticipant) {
      router.replace(`/session/${id}/lobby`);
    }
  }, [alreadyParticipant, id, router]);

  if (authLoading || isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Join Session" }} />
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator color={tokens.primary} />
        </View>
      </>
    );
  }

  if (!athlete) {
    return null; // useRequireAthlete is redirecting
  }

  if (error || !data) {
    return (
      <>
        <Stack.Screen options={{ title: "Join Session" }} />
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Text className="text-center text-base font-semibold text-foreground">
            Session unavailable
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {error ?? "This session has ended or doesn't exist."}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Join Session", headerShown: true }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <JoinWizard
          sessionId={id}
          gymName={data.gymName}
          gymLatitude={data.gymLatitude}
          gymLongitude={data.gymLongitude}
          athleteWeight={data.athleteWeight}
          requiresWaiver={data.requiresWaiver}
          hasSignedWaiver={data.hasSignedWaiver}
          activeWaiverId={activeWaiverId}
          currentAthleteId={athlete.id}
          currentAthleteName={athlete.display_name ?? "You"}
          currentAthleteElo={athlete.current_elo}
          currentAthletePhotoUrl={athlete.profile_photo_url ?? null}
        />
      </ScrollView>
    </>
  );
}

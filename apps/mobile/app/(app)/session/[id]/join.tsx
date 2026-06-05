import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useSessionForJoin } from "@/lib/session/use-session-for-join";
import { JoinWizard } from "@/components/session/join-wizard";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer, PageSurface } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

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
      <PageSurface>
        <AppHeader title="Join Session" back backFallback="/gyms" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </PageSurface>
    );
  }

  if (!athlete) {
    return null; // useRequireAthlete is redirecting
  }

  if (error || !data) {
    return (
      <PageSurface>
        <AppHeader title="Join Session" back backFallback="/gyms" />
        <View className="flex-1 items-center justify-center px-6">
          <Plate className="items-center py-8">
            <Text className="font-heading text-[16px] text-ink text-center mb-2">
              Session unavailable
            </Text>
            <Text className="font-body text-[13px] text-ink-2 text-center">
              {error ?? "This session has ended or doesn’t exist."}
            </Text>
          </Plate>
        </View>
      </PageSurface>
    );
  }

  return (
    <PageSurface>
      <AppHeader title="Join Session" back backFallback="/gyms" />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 20, gap: 24 }}>
        <View>
          <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl mb-1">
            Checking In
          </Text>
          <Text className="font-heading text-[22px] text-ink" numberOfLines={1}>
            {data.gymName}
          </Text>
        </View>

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
      </PageContainer>
    </PageSurface>
  );
}

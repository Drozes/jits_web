import * as React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { MatchResultHeader } from "@/components/match-detail/match-result-header";
import { OpponentLinkRow } from "@/components/match-detail/opponent-link-row";
import { MatchVideoSection } from "@/components/match-detail/match-video-section";
import {
  MatchDetailError,
  MatchDetailSkeleton,
} from "@/components/match-detail/match-detail-states";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { useMatchDetail } from "@/lib/match-detail/use-match-detail";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * One past match, opened from a history row (V-epic jits-5tj9.7): verdict,
 * rating change, opponent, and every recording of it with a Watch that pushes
 * the player.
 *
 * This is a plain pushed screen, NOT the live match wizard (`match/[matchId]`):
 * it must never call `useArenaMatchScreen`, which takes the athlete offline
 * and suppresses challenge prompts. Reading an old match changes no presence.
 */
export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { state, data, error, refreshing, refetch } = useMatchDetail(matchId);

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const label =
    state === "ready" && data
      ? `Match detail vs ${data.opponent?.display_name ?? "Opponent"}`
      : "Match detail";

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Match" back backFallback="/" />
      {state === "ready" && data ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refetch}
              tintColor={tokens.accentCta}
            />
          }
        >
          <MatchResultHeader view={data} />
          {data.opponent ? (
            <OpponentLinkRow
              opponent={data.opponent}
              onPress={() => router.push(`/(app)/athlete/${data.opponent!.athlete_id}`)}
            />
          ) : null}
          <MatchVideoSection
            videos={data.videos}
            onWatch={(videoId) => router.push(`/(app)/video/${videoId}`)}
          />
        </ScrollView>
      ) : state === "error" ? (
        <MatchDetailError code={error?.code ?? "UNKNOWN"} onBack={goBack} onRetry={refetch} />
      ) : (
        <MatchDetailSkeleton />
      )}
      <HarnessMarker testID="match-detail-screen" label={label} />
    </View>
  );
}

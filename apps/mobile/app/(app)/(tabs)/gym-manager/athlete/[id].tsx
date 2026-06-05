import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { EloTile } from "@/components/ui/elo-system";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymAthleteDetail } from "@/lib/gym-manager/use-gym-athlete-detail";
import { formatWinRate } from "@/lib/gym-manager/roster-format";
import { EloSparkline } from "@/components/gym-manager/elo-sparkline";
import {
  DetailHeader,
  RecentMatchRow,
  SectionLabel,
  StatGrid,
  StatTile,
} from "@/components/gym-manager/athlete-detail-parts";

/**
 * H7 · Gym-owner athlete detail. Manager-scoped member stats: ELO, record,
 * win rate, peak ELO, a last-10 ELO-trend sparkline, and the last-5 matches.
 * Resolves the managed gym via useManagedGyms and the member id from the route;
 * the display name is passed through the navigation param (the detail RPC does
 * not echo it back). Loads via useGymAthleteDetail (manager-gated, member-scoped).
 */
export default function GymManagerAthleteDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const tokens = useThemedTokens();
  const { isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gym = gyms[0];
  const gymId = gym?.gymId;
  const { data, isManager, notMember, isLoading } = useGymAthleteDetail(
    gymId,
    id,
  );

  const displayName = name ?? "Athlete";
  const total = data ? data.wins + data.losses + data.draws : 0;

  if (authLoading || !managedReady || (gymId && id && isLoading)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title={displayName} back backFallback="/gym-manager/roster" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (!gymId || !isManager || notMember || !data) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title={displayName} back backFallback="/gym-manager/roster" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l text-center">
            {notMember ? "Not A Gym Member" : "Athlete Unavailable"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title={displayName} back backFallback="/gym-manager/roster" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        <DetailHeader name={displayName} gymName={gym?.name ?? null} />

        <EloTile
          label="ELO Rating"
          value={data.currentElo}
          size="hero"
          accentBar
          className="items-center"
        />

        <StatGrid>
          <StatTile label="Matches" value={String(total)} />
          <StatTile
            label="Record"
            value={`${data.wins}W · ${data.losses}L · ${data.draws}D`}
            compact
          />
          <StatTile label="Win Rate" value={formatWinRate(data.winRate, total)} />
          <StatTile label="Peak ELO" value={String(data.peakElo)} />
        </StatGrid>

        <View className="gap-2">
          <SectionLabel>ELO Trend · Last 10</SectionLabel>
          <View className="bg-surface-3 border border-hairline rounded-md p-4">
            <EloSparkline points={data.eloTrend} />
            <View className="flex-row justify-between mt-2">
              <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
                10 Matches Ago
              </Text>
              <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
                Now
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-2">
          <SectionLabel>Match History · Last 5</SectionLabel>
          {data.lastMatches.length > 0 ? (
            <View className="gap-[1px]">
              {data.lastMatches.map((m, i) => (
                <RecentMatchRow key={`${m.occurred_at}-${i}`} match={m} />
              ))}
            </View>
          ) : (
            <View className="bg-surface-3 border border-hairline rounded-md px-4 py-6 items-center">
              <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
                No Matches Yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

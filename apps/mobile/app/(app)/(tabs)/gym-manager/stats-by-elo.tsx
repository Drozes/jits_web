import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymBracketStats } from "@/lib/gym-manager/use-gym-bracket-stats";
import { BracketCard } from "@/components/gym-manager/bracket-card";
import { RangeChips } from "@/components/gym-manager/stats-parts";
import type { GymStatsRange } from "@jits/shared/api/queries";

function parseRange(value: string | undefined): GymStatsRange {
  if (value === "30d" || value === "90d" || value === "all") return value;
  return "90d";
}

/**
 * H10 · Gym-owner stats by ELO range. Manager-gated per-bracket drill-down
 * (1900+ / 1700-1900 / 1500-1700 / 1300-1500) of counts, rates, momentum,
 * finish times, and top winning/losing submissions over a 30d/90d/all window.
 * Seeds the range from the H8 nav param, then owns its own chip toggle.
 * Resolves the managed gym via useManagedGyms; loads via useGymBracketStats.
 */
export default function GymManagerStatsByEloScreen() {
  const { range: rangeParam } = useLocalSearchParams<{ range?: string }>();
  const tokens = useThemedTokens();
  const { isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gymId = gyms[0]?.gymId;
  const [range, setRange] = React.useState<GymStatsRange>(
    parseRange(rangeParam),
  );
  const { brackets, isManager, isLoading } = useGymBracketStats(gymId, range);

  const totalAthletes = brackets.reduce((sum, b) => sum + b.athleteCount, 0);
  const totalMatches = brackets.reduce((sum, b) => sum + b.matchCount, 0);

  if (authLoading || !managedReady || (gymId && isLoading && brackets.length === 0)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Stats · By ELO Range" back backFallback="/gym-manager/stats" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (!gymId || !isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Stats · By ELO Range" back backFallback="/gym-manager/stats" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l text-center">
            No Managed Gym
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Stats · By ELO Range" back backFallback="/gym-manager/stats" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 12,
        }}
      >
        <RangeChips value={range} onChange={setRange} />

        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l -mt-1">
          {totalAthletes} ATHLETES · {totalMatches} MATCHES · {brackets.length}{" "}
          BRACKET{brackets.length === 1 ? "" : "S"}
        </Text>

        {brackets.length > 0 ? (
          brackets.map((b) => <BracketCard key={b.bracket} bracket={b} />)
        ) : (
          <View className="bg-surface-3 border border-hairline rounded-md px-4 py-12 items-center">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
              No Bracket Data Yet
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

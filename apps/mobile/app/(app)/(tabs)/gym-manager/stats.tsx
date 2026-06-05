import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymStats } from "@/lib/gym-manager/use-gym-stats";
import { GymStatsTrend } from "@/components/gym-manager/gym-stats-trend";
import {
  DrillDownTile,
  DurationGrid,
  RangeChips,
  RatePlate,
  SectionLabel,
  SplitMeter,
  StatHero,
  SubRankList,
} from "@/components/gym-manager/stats-parts";
import {
  formatElo,
  formatPct,
  formatRangeSuffix,
} from "@/lib/gym-manager/stats-format";
import type { GymStatsRange } from "@jits/shared/api/queries";

/**
 * H8 · Gym-owner gym stats. Manager-gated aggregate dashboard over a 30d/90d/all
 * window: avg gym ELO + momentum, submission rate (split meter), draw rate +
 * Pressure-Score ELO cost, winning/losing submission breakdown, avg win/loss
 * finish times, and an ELO trend sparkline. A drill-down tile opens the H10
 * per-ELO-bracket breakdown. Resolves the managed gym via useManagedGyms and
 * loads via useGymStats (manager-gated getGymStats).
 */
export default function GymManagerStatsScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gymId = gyms[0]?.gymId;
  const [range, setRange] = React.useState<GymStatsRange>("90d");
  const { data, isManager, isLoading } = useGymStats(gymId, range);

  const rangeSuffix = formatRangeSuffix(range);

  if (authLoading || !managedReady || (gymId && isLoading && !data)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym Stats" back backFallback="/gym-manager" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (!gymId || !isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym Stats" back backFallback="/gym-manager" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l text-center">
            No Managed Gym
          </Text>
        </View>
      </View>
    );
  }

  const stats = data;
  // submissionRate covers finishes ending in submission; the remainder are time
  // expiries. Draw count is derived from the rate against the trend window's
  // total via the aside number, so we present the rate share for the meter.
  const timeRate = stats ? Math.max(0, 1 - stats.submissionRate) : 0;

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Gym Stats" back backFallback="/gym-manager" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 32,
        }}
      >
        <RangeChips value={range} onChange={setRange} />

        <DrillDownTile
          label="Drill Down By ELO Range"
          onPress={() =>
            router.push(`/gym-manager/stats-by-elo?range=${range}` as never)
          }
        />

        {stats ? (
          <>
            <SectionLabel>Gym Rating</SectionLabel>
            <StatHero
              label="Avg Gym ELO"
              value={stats.avgElo}
              momentum={stats.momentum}
              caption="momentum"
            />

            <SectionLabel>Submission Rate</SectionLabel>
            <RatePlate
              headline={formatPct(stats.submissionRate)}
              headlineSub="Matches Ending In Submission"
              asideValue={`${rangeSuffix}`}
              asideLabel="Window"
              tone="accent"
            >
              <SplitMeter
                fraction={stats.submissionRate}
                leftLabel={`${formatPct(stats.submissionRate)} Submission`}
                rightLabel={`${formatPct(timeRate)} Time Expired`}
              />
            </RatePlate>

            <SectionLabel>Draws</SectionLabel>
            <RatePlate
              headline={formatPct(stats.drawRate)}
              headlineSub="Matches Ending In Draw"
              asideValue={formatElo(stats.avgEloOnDraw)}
              asideLabel="Avg ELO · Equal Match"
              tone="negative"
            >
              <View className="flex-row justify-between pt-3 border-t border-hairline-faint">
                <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
                  Draws Cost ELO
                </Text>
                <Text className="font-mono text-[10px] text-amber-500 uppercase tracking-caps-l">
                  Pressure Score
                </Text>
              </View>
            </RatePlate>

            <SectionLabel>Winning Submissions</SectionLabel>
            <SubRankList subs={stats.winningSubmissions} variant="winning" />

            <SectionLabel>Losing Submissions</SectionLabel>
            <SubRankList subs={stats.losingSubmissions} variant="losing" />

            <SectionLabel>Match Duration</SectionLabel>
            <DurationGrid
              avgWinTime={stats.avgWinTime}
              avgLossTime={stats.avgLossTime}
            />

            <SectionLabel>{`ELO Trend · ${rangeSuffix}`}</SectionLabel>
            <View className="bg-surface-3 border border-hairline rounded-md p-4">
              <GymStatsTrend points={stats.eloTrend} />
              <View className="flex-row justify-between mt-2">
                <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
                  Earliest
                </Text>
                <Text className="font-mono text-[9px] text-ink-3 uppercase tracking-caps-l">
                  Now
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

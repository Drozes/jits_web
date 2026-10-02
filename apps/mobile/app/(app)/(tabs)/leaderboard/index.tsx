import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Chip, MetaTag } from "@/components/ui/elo-system";
import { SkeletonProvider, SkeletonRankRow } from "@/components/ui/skeleton";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { BrandHeader } from "@/components/layout/brand-header";
import { useLeaderboardData } from "@/lib/leaderboard/use-leaderboard-data";
import {
  GenderFilterRow,
  type GenderFilter,
} from "@/components/leaderboard/gender-filter-row";
import { FightersList } from "@/components/leaderboard/fighters-list";
import { GymsList } from "@/components/leaderboard/gyms-list";
import { useFirstLoadEntering } from "@/lib/motion";
import { useRankClimb } from "@/lib/leaderboard/use-rank-climb";

type TabValue = "fighters" | "gyms";

/**
 * List-body placeholder shown until BOTH the athletes SELECT and the stats RPC
 * land. Always 8 full rows, never a half-empty list (the brief's hard rule).
 * The bars carry the shared skeleton shimmer (Motion Rule, Ambient tier).
 */
function RankingsSkeleton() {
  return (
    <SkeletonProvider>
      <View className="px-3 pt-1" style={{ gap: 1 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRankRow key={i} />
        ))}
      </View>
    </SkeletonProvider>
  );
}

export default function LeaderboardScreen() {
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { athletes, gyms, isLoading, isRefreshing, refresh } = useLeaderboardData(
    athlete?.id,
  );
  const [tab, setTab] = React.useState<TabValue>("fighters");
  const [genderFilter, setGenderFilter] = React.useState<GenderFilter>(() => {
    if (athlete?.gender === "M") return "male";
    if (athlete?.gender === "F") return "female";
    return "all";
  });

  const filteredAthletes = React.useMemo(() => {
    if (!athletes) return [];
    if (genderFilter === "all") return athletes;
    return athletes.filter((a) =>
      genderFilter === "male" ? a.gender === "M" : a.gender === "F",
    );
  }, [athletes, genderFilter]);

  const currentUserAthlete = React.useMemo(() => {
    if (!athletes) return null;
    return athletes.find((a) => a.isCurrentUser) ?? null;
  }, [athletes]);

  // Motion Rule moments, both on real transitions only: the list enter
  // stagger plays when the rows first appear (never on refetch, refresh or a
  // filter change), and the rank-up swap flare plays once per climb.
  const entering = useFirstLoadEntering();
  // A climb is detected and used up only while the fighters list is on
  // screen, so it is never spent while nobody can see it.
  const isFocused = useIsFocused();
  const rankClimb = useRankClimb(
    athlete?.id,
    currentUserAthlete?.rank ?? null,
    tab === "fighters" && isFocused,
  );

  // Spinner covers AUTH ONLY. Once the athlete exists the chrome paints
  // immediately and the list body carries the skeleton.
  if (authLoading || !athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  // Hold the list on the skeleton until the last-seen rank is read (capped at
  // RANK_READ_TIMEOUT_MS, 300ms), so a climb starts from the old order
  // instead of jumping new, old, new.
  const listLoading = isLoading || !rankClimb.ready;

  const countLabel = listLoading
    ? "Loading · Live"
    : tab === "fighters"
      ? `${filteredAthletes.length} Athletes · Live`
      : `${(gyms ?? []).length} Gyms · Live`;

  return (
    <View className="flex-1 bg-surface">
      <BrandHeader />

      <View className="px-4 py-3 border-b border-hairline-faint" style={{ gap: 8 }}>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Chip active={tab === "fighters"} onPress={() => setTab("fighters")}>
            Fighters
          </Chip>
          <Chip active={tab === "gyms"} onPress={() => setTab("gyms")}>
            Gyms
          </Chip>
        </View>
        {tab === "fighters" ? (
          <GenderFilterRow current={genderFilter} onSelect={setGenderFilter} />
        ) : null}
      </View>

      <View className="px-4 pt-3 pb-2">
        <MetaTag>{countLabel}</MetaTag>
      </View>

      {listLoading ? (
        <RankingsSkeleton />
      ) : tab === "fighters" ? (
        <FightersList
          athletes={filteredAthletes}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          currentUser={currentUserAthlete}
          entering={entering}
          climb={rankClimb.climb}
        />
      ) : (
        <GymsList
          gyms={gyms ?? []}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
        />
      )}
    </View>
  );
}

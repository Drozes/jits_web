import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { Chip } from "@/components/ui/elo-system";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymLadder } from "@/lib/gym-manager/use-gym-ladder";
import { LadderRow } from "@/components/gym-manager/ladder-row";
import { RangeChips } from "@/components/gym-manager/stats-parts";
import {
  deriveCities,
  findOwnGym,
  formatLadderSummary,
} from "@/lib/gym-manager/ladder-format";
import { formatMomentum, formatRangeSuffix } from "@/lib/gym-manager/stats-format";
import type { GymStatsRange } from "@jits/shared/api/queries";

const ALL_CITIES = "all";

/**
 * H9 · Gym-owner gym ladder. A cross-gym ranking (gyms by avg member ELO) over a
 * 30d/90d/all window, with a city filter, the manager's own gym highlighted (and
 * called out in the summary line with its rank + momentum), and per-gym momentum
 * arrows. Aggregate-only, so it loads via useGymLadder (not manager-gated);
 * resolves the own gym from useManagedGyms to drive the highlight and the
 * default city. City filtering is client-side off the full row set so the chips
 * switch instantly; the range filter (30d/90d/all, RangeChips) re-fetches.
 *
 * The default-city effect only auto-scopes to the manager's own gym city when
 * that city is actually present in the loaded ladder rows; if the own gym is
 * small/new (absent from get_gym_ladder, which only lists gyms with active
 * members) the filter stays on "All Cities" so the user is never stuck on a
 * falsely-empty list with no active chip.
 */
export default function GymManagerLadderScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const ownGym = gyms[0];

  const [range, setRange] = React.useState<GymStatsRange>("90d");
  const { rows, isLoading, isRefreshing, refresh } = useGymLadder(range);

  const cities = React.useMemo(() => deriveCities(rows), [rows]);

  // Default the city filter to the manager's own gym city once the ladder rows
  // have resolved, so the ladder opens scoped to the local scene; "All Cities"
  // widens it. Only apply the default when that city actually exists in the
  // loaded rows (a chip will exist and the filter will match); otherwise leave
  // it on "All Cities" so a small/new own gym never strands the user on an empty
  // list with no active chip.
  const [city, setCity] = React.useState<string>(ALL_CITIES);
  const cityInitialized = React.useRef(false);
  React.useEffect(() => {
    if (cityInitialized.current) return;
    if (!managedReady || isLoading) return;
    cityInitialized.current = true;
    const ownCity = ownGym?.city?.trim();
    if (ownCity && cities.includes(ownCity)) setCity(ownCity);
  }, [managedReady, isLoading, ownGym?.city, cities]);

  const filtered = React.useMemo(() => {
    if (city === ALL_CITIES) return rows;
    return rows.filter((r) => r.city === city);
  }, [rows, city]);

  const ownStanding = React.useMemo(
    () => findOwnGym(filtered, ownGym?.gymId),
    [filtered, ownGym?.gymId],
  );

  const rangeSuffix = formatRangeSuffix(range);

  if (authLoading || !managedReady || isLoading) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym Ladder" back backFallback="/gym-manager" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Gym Ladder" back backFallback="/gym-manager" />

      <View className="px-4 pt-3">
        <RangeChips value={range} onChange={setRange} />
      </View>

      <View className="px-4 pb-3 border-b border-hairline-faint">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[ALL_CITIES, ...cities]}
          keyExtractor={(c) => c}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Chip active={city === item} onPress={() => setCity(item)}>
              {item === ALL_CITIES ? "All Cities" : item}
            </Chip>
          )}
        />
      </View>

      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {formatLadderSummary(filtered.length, rangeSuffix)}
        </Text>
        {ownStanding ? (
          <Text className="font-mono-bold text-[10px] text-success uppercase tracking-caps-l">
            Your Gym #{ownStanding.rank} · {formatMomentum(ownStanding.row.momentum)}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.gymId}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 32,
          gap: 1,
        }}
        renderItem={({ item, index }) => (
          <LadderRow
            row={item}
            rank={index + 1}
            isOwn={item.gymId === ownGym?.gymId}
            isLeader={index === 0}
            onPress={() => router.push(`/gyms/${item.gymId}` as never)}
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-12 px-8">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l text-center">
              {city === ALL_CITIES ? "No Partner Gyms Yet" : `No Gyms In ${city}`}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.accentCta}
          />
        }
      />
    </View>
  );
}

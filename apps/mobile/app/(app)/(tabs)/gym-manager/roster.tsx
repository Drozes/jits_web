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
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymRoster } from "@/lib/gym-manager/use-gym-roster";
import { RosterRow } from "@/components/gym-manager/roster-row";

/**
 * H6 · Gym-owner roster. Active members sorted by ELO DESC (BE order), each row
 * showing name, ELO, most-recent delta, last-active, and a PROVISIONAL badge
 * (< 20 matches). Resolves the managed gym via useManagedGyms, then loads the
 * roster from useGymRoster (manager-gated getGymRoster). Tapping a row opens H7.
 */
export default function GymManagerRosterScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gymId = gyms[0]?.gymId;
  const { roster, isManager, isLoading, isRefreshing, refresh } =
    useGymRoster(gymId);

  if (authLoading || !managedReady || (gymId && isLoading)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athletes" back backFallback="/gym-manager" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (!gymId || !isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Athletes" back backFallback="/gym-manager" />
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
      <AppHeader title="Athletes" back backFallback="/gym-manager" />
      <FlatList
        data={roster}
        keyExtractor={(r) => r.athleteId}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 8,
        }}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
              Roster
            </Text>
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
              By ELO ↓
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <RosterRow
            row={item}
            isSelf={item.athleteId === athlete?.id}
            onPress={() =>
              router.push(
                `/gym-manager/athlete/${item.athleteId}?name=${encodeURIComponent(item.displayName)}` as never,
              )
            }
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-12 px-8">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l text-center">
              No Active Athletes
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

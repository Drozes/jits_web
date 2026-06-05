import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Plus } from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import { Chip } from "@/components/ui/elo-system";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymSessions } from "@/lib/gym-manager/use-gym-sessions";
import { SessionRow } from "@/components/gym-manager/session-row";
import { SessionEditSheet } from "@/components/gym-manager/session-edit-sheet";
import type { SessionListItem } from "@jits/shared/types/session";

type Filter = "all" | "upcoming";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
];

/**
 * H2 · Gym-owner sessions list. All/Upcoming filter chips, one-time session
 * rows (recurring schedules live in templates), and create/edit via the shared
 * SessionEditSheet. Resolves the managed gym via useManagedGyms, then loads the
 * session list from useGymSessions (reuses getGymDetail — no new RPC).
 */
export default function GymManagerSessionsScreen() {
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gymId = gyms[0]?.gymId;
  const { data, isLoading, isRefreshing, refresh } = useGymSessions(gymId, athlete?.id);
  const [filter, setFilter] = React.useState<Filter>("all");

  const sessions = data?.sessions ?? [];
  const visible = React.useMemo<SessionListItem[]>(() => {
    if (filter === "upcoming") {
      return sessions.filter((s) => s.status === "scheduled");
    }
    return sessions;
  }, [sessions, filter]);

  if (authLoading || !managedReady || (gymId && isLoading)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Sessions" back backFallback="/gym-manager" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  if (!gymId || !data?.isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Sessions" back backFallback="/gym-manager" />
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
      <AppHeader
        title="Sessions"
        back
        backFallback="/gym-manager"
        rightAction={
          <SessionEditSheet gymId={gymId} onSaved={refresh}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New session"
              hitSlop={10}
              className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
            >
              <View pointerEvents="none">
                <Plus size={20} color={tokens.textSecondary} />
              </View>
            </Pressable>
          </SessionEditSheet>
        }
      />

      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 120,
          gap: 8,
        }}
        ListHeaderComponent={
          <View className="flex-row gap-2 mb-3">
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                active={filter === f.value}
                onPress={() => setFilter(f.value)}
              >
                {f.label}
              </Chip>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <SessionEditSheet gymId={gymId} session={item} onSaved={refresh}>
            <SessionRow session={item} onPress={() => {}} />
          </SessionEditSheet>
        )}
        ListEmptyComponent={
          <View className="items-center py-12 px-8">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l text-center">
              {filter === "upcoming"
                ? "No Upcoming Sessions"
                : "No Sessions Scheduled"}
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

      <View className="absolute left-0 right-0 bottom-0 px-4 pt-3 pb-8 bg-surface border-t border-hairline">
        <SessionEditSheet gymId={gymId} onSaved={refresh}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New session"
            className="bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover flex-row gap-2"
          >
            <View pointerEvents="none">
              <Plus size={16} color={tokens.textOnAccent} />
            </View>
            <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
              New Session
            </Text>
          </Pressable>
        </SessionEditSheet>
      </View>
    </View>
  );
}

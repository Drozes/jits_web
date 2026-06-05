import * as React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  BarChart3,
  CalendarRange,
  FileText,
  LayoutGrid,
  ListOrdered,
  Users,
} from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import { toast } from "@/components/ui";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import { useGymHub } from "@/lib/gym-manager/use-gym-hub";
import {
  MetricGrid,
  MetricTile,
  NextSessionPlate,
  SectionLabel,
  ShortcutGrid,
  ShortcutTile,
} from "@/components/gym-manager/hub-parts";

/**
 * H1 · Gym-owner hub. Manager-gated landing for the gym-manager tab:
 *   - next-session plate (live or soonest upcoming) with a countdown
 *   - this-month metric tiles (active athletes, matches)
 *   - shortcut tiles to Sessions, Athletes, Gym Stats, Gym Ladder
 *
 * Resolves the managed gym via useManagedGyms, then loads the hub via useGymHub
 * (reuses getGymDetail + getGymManagerStats). The tab itself is only rendered
 * for managers (see (tabs)/_layout.tsx), so this is a defensive guard.
 */
export default function GymManagerHubScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { gyms, isReady: managedReady } = useManagedGyms();
  const gymId = gyms[0]?.gymId;
  const { data, isLoading, isRefreshing, refresh } = useGymHub(gymId, athlete?.id);

  const go = (path: string) => () => router.push(path as never);
  const placeholder = (label: string) => () =>
    toast.info(`${label} coming soon`);

  if (authLoading || !managedReady || (gymId && isLoading)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  // Not a manager of any gym (or the lookup found none): the tab is normally
  // hidden, so this only shows if state changed mid-session.
  if (!gymId || !data?.isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l text-center">
            No Managed Gym
          </Text>
          <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l text-center mt-2">
            You don't manage a gym yet
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title={data.gymName} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 32,
          gap: 8,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        <SectionLabel>Next Session</SectionLabel>
        <View className="mb-3">
          <NextSessionPlate
            session={data.nextSession}
            isLive={data.nextIsLive}
            onPress={
              data.nextSession
                ? go(
                    data.nextIsLive
                      ? `/session/${data.nextSession.id}/join`
                      : "/gym-manager/sessions",
                  )
                : go("/gym-manager/sessions")
            }
          />
        </View>

        <SectionLabel>This Month</SectionLabel>
        <View className="mb-3">
          <MetricGrid>
            <MetricTile
              label="Active Athletes"
              value={String(data.stats.activeMemberCount)}
            />
            <MetricTile
              label="Matches"
              value={String(data.stats.totalMatches)}
            />
          </MetricGrid>
        </View>

        <SectionLabel>Manage</SectionLabel>
        <View className="mb-3">
          <ShortcutGrid>
            <ShortcutTile
              icon={CalendarRange}
              label="Schedule"
              onPress={go("/gym-manager/sessions")}
            />
            <ShortcutTile
              icon={FileText}
              label="Documents"
              onPress={placeholder("Documents")}
            />
            <ShortcutTile
              icon={Users}
              label="Athletes"
              onPress={go("/gym-manager/roster")}
            />
          </ShortcutGrid>
        </View>

        <SectionLabel>Insights</SectionLabel>
        <ShortcutGrid>
          <ShortcutTile
            icon={BarChart3}
            label="Gym Stats"
            onPress={go("/gym-manager/stats")}
          />
          <ShortcutTile
            icon={ListOrdered}
            label="Gym Ladder"
            onPress={go("/gym-manager/ladder")}
          />
          <ShortcutTile
            icon={LayoutGrid}
            label="Session Stats"
            onPress={placeholder("Session Stats")}
          />
        </ShortcutGrid>
      </ScrollView>
    </View>
  );
}

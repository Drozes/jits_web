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
import {
  managerHref,
  useGymManagerGymId,
} from "@/lib/gym-manager/use-gym-manager-gym-id";
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
 * H1 · Gym-owner hub. Manager-gated landing for the gym-owner portal:
 *   - next-session plate (live or soonest upcoming) with a countdown
 *   - this-month metric tiles (active athletes, matches)
 *   - shortcut tiles to Sessions, Athletes, Gym Stats, Gym Ladder
 *
 * Resolves the gym via useGymManagerGymId (the `gymId` route param handed over
 * by the Manage Gym affordance on /gyms/[id], validated against the athlete's
 * managed gyms), then loads the hub via useGymHub (reuses getGymDetail +
 * getGymManagerStats). The portal is entered only through that affordance,
 * which is itself manager-gated, so the non-manager branch is a defensive guard.
 */
export default function GymManagerHubScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { gymId, isReady: managedReady } = useGymManagerGymId();
  const { data, isLoading, isRefreshing, refresh } = useGymHub(gymId, athlete?.id);

  // The hub is no longer a tab root: it is pushed from /gyms/[id]. On a cold
  // entry (deep link or reload) there is nothing to pop to, so the chevron
  // falls back to the gym screen that owns the entry point.
  const gymBackFallback = gymId ? `/gyms/${gymId}` : "/gyms";

  // Portal-internal links carry the active gym forward; a session link leaves
  // the portal, so it does not.
  const go = (pathname: string) => () =>
    router.push(managerHref(pathname, gymId));
  const goSession = (pathname: string) => () => router.push(pathname);
  const placeholder = (label: string) => () =>
    toast.info(`${label} coming soon`);

  if (authLoading || !managedReady || (gymId && isLoading)) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym" back backFallback={gymBackFallback} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </View>
    );
  }

  // Not a manager of the resolved gym (or the lookup found none). The entry
  // point is manager-gated, so this only shows if state changed mid-session.
  if (!gymId || !data?.isManager) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym" back backFallback={gymBackFallback} />
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
      <AppHeader title={data.gymName} back backFallback={gymBackFallback} />
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
              data.nextSession && data.nextIsLive
                ? goSession(`/session/${data.nextSession.id}/join`)
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

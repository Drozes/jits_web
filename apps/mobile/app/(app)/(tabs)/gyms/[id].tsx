import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Pencil, Plus } from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import { SessionCard } from "@/components/session-card";
import { CreateSessionSheet } from "@/components/session/create-session-sheet";
import { EditGymSheet } from "@/components/gyms/edit-gym-sheet";
import { SessionTemplates } from "@/components/session/session-templates";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getGymDetail, getGymManagerStats } from "@jits/shared/api/queries";
import { toast } from "@/components/ui";
import type { GymDetail } from "@jits/shared/types/session";
import {
  formatDistanceKm,
  haversineKm,
  useLocation,
} from "@/lib/location/use-location";
import {
  ActiveSessionPlate,
  GymTitleBlock,
  LastSessionPlate,
  StatsGrid,
  UpcomingSessionsSection,
} from "@/components/gyms/gym-detail-parts";

interface GymCoords {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

function useGymDetailData(gymId: string | undefined, athleteId: string | undefined) {
  const [data, setData] = React.useState<GymDetail | null>(null);
  const [coords, setCoords] = React.useState<GymCoords | null>(null);
  // Ready-to-render Avg Session value (web-parity formula). Defaults to "0".
  const [avgPerSession, setAvgPerSession] = React.useState("0");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    // `isCancelled` reads the live effect flag so a resolved promise from an
    // unmounted / param-changed mount never writes state (stale flash +
    // setState-after-unmount). Defaults to "never cancelled" for the
    // pull-to-refresh path, which has no teardown to race.
    async (mode: "initial" | "refresh", isCancelled: () => boolean = () => false) => {
      if (!gymId || !athleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const [detail, { data: gymRow }, stats] = await Promise.all([
          getGymDetail(supabase, gymId, athleteId),
          supabase
            .from("gyms")
            .select("latitude, longitude, address")
            .eq("id", gymId)
            .maybeSingle(),
          // Stats are non-critical: a slow/failed fetch must not break the gym
          // render, so swallow its rejection and fall back to the empty value.
          getGymManagerStats(supabase, gymId).catch((err) => {
            console.error("[gym-detail] stats fetch failed", err);
            return null;
          }),
        ]);
        if (isCancelled()) return;
        setData(detail);
        if (gymRow) {
          setCoords({
            latitude: gymRow.latitude,
            longitude: gymRow.longitude,
            address: gymRow.address,
          });
        }
        // Web parity: participants / sessions to 1dp; "0" when no sessions.
        setAvgPerSession(
          stats && stats.totalSessions > 0
            ? (stats.totalParticipants / stats.totalSessions).toFixed(1)
            : "0",
        );
      } catch (err) {
        console.error("[gym-detail] fetch failed", err);
        if (!isCancelled()) toast.error("Failed to load gym");
      } finally {
        if (!isCancelled()) {
          if (mode === "initial") setIsLoading(false);
          else setIsRefreshing(false);
        }
      }
    },
    [gymId, athleteId],
  );

  React.useEffect(() => {
    let cancelled = false;
    void fetchAll("initial", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return { data, coords, avgPerSession, isLoading, isRefreshing, refresh: () => fetchAll("refresh") };
}

export default function GymDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, coords, avgPerSession, isLoading, isRefreshing, refresh } = useGymDetailData(
    id,
    athlete?.id,
  );
  const location = useLocation();

  const distanceKm = React.useMemo(() => {
    if (!location.position || !coords?.latitude || !coords?.longitude) return null;
    return haversineKm(location.position, {
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  }, [location.position, coords]);

  const rsvpSet = React.useMemo(
    () => new Set(data?.rsvpSessionIds ?? []),
    [data?.rsvpSessionIds],
  );
  const participantSet = React.useMemo(
    () => new Set(data?.participantSessionIds ?? []),
    [data?.participantSessionIds],
  );

  const activeSession = React.useMemo(
    () => data?.sessions.find((s) => s.status === "active") ?? null,
    [data?.sessions],
  );
  const upcomingSessions = React.useMemo(
    () => (data?.sessions ?? []).filter((s) => s.status !== "active"),
    [data?.sessions],
  );

  if (authLoading || isLoading) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader title="Gym" back backFallback="/gyms" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-heading text-[14px] text-ink uppercase tracking-caps-l">
            Gym Not Found
          </Text>
        </View>
      </View>
    );
  }

  const addressLabel = (coords?.address ?? data.city ?? "Unknown City").toString();
  const memberLabel = `${data.memberCount} ${data.memberCount === 1 ? "Member" : "Members"}`;
  // Avg Session is wired (web parity); Avg ELO stays a placeholder until its
  // backing query lands (shared/BE work, out of scope here).
  const avgElo = "—";

  return (
    <View className="flex-1 bg-surface">
      <AppHeader
        title="Gym"
        back
        backFallback="/gyms"
        rightAction={
          data.isGymManager ? (
            <EditGymSheet
              gymId={data.id}
              currentName={data.name}
              currentCity={data.city}
              onUpdated={refresh}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit gym"
                hitSlop={10}
                className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
              >
                <View pointerEvents="none">
                  <Pencil size={16} color={tokens.textSecondary} />
                </View>
              </Pressable>
            </EditGymSheet>
          ) : null
        }
      />

      {/*
        Two render paths:
          - Non-manager: compact ParticipantRow attendance list (E2 wireframe).
          - Manager: full SessionCard list so they retain the 3-dot
            SessionActions menu for activate/cancel/complete per session.
      */}
      <FlatList
        data={data.isGymManager ? upcomingSessions : []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 96,
          gap: 12,
        }}
        ListHeaderComponent={
          <View className="gap-5 mb-1">
            <GymTitleBlock
              name={data.name}
              address={addressLabel}
              isMyGym={data.isMemberGym}
              distanceLabel={distanceKm != null ? formatDistanceKm(distanceKm) : null}
              memberLabel={memberLabel}
              showLocationCta={location.isGranted !== true}
              locationLoading={location.isLoading}
              onRequestLocation={() => {
                if (location.isLoading) return;
                void location.request();
              }}
            />

            {activeSession ? <ActiveSessionPlate session={activeSession} /> : null}

            {!data.isGymManager ? (
              <UpcomingSessionsSection
                sessions={upcomingSessions}
                rsvpSet={rsvpSet}
                participantSet={participantSet}
              />
            ) : null}

            <StatsGrid avgPerSession={avgPerSession} avgElo={avgElo} />

            <LastSessionPlate />

            {data.isGymManager ? (
              <>
                <CreateSessionSheet gymId={data.id} onCreated={refresh}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start session"
                    className="bg-cta rounded-sm py-3 px-5 items-center justify-center active:bg-cta-hover flex-row gap-2"
                  >
                    <View pointerEvents="none">
                      <Plus size={16} color={tokens.textOnAccent} />
                    </View>
                    <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
                      Start Session
                    </Text>
                  </Pressable>
                </CreateSessionSheet>
                <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl mt-2">
                  Upcoming Sessions
                  {upcomingSessions.length > 0 ? ` · ${upcomingSessions.length}` : ""}
                </Text>
              </>
            ) : null}

            <SessionTemplates gymId={data.id} isManager={data.isGymManager} />
          </View>
        }
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            isRsvpd={rsvpSet.has(item.id)}
            isParticipant={participantSet.has(item.id)}
            canManage={item.createdBy === athlete?.id || !!data?.isGymManager}
            onActionComplete={refresh}
          />
        )}
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

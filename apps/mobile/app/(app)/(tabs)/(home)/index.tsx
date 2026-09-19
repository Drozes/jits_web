import * as React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import {
  getActiveSession,
  getDashboardSummary,
  getGymDetailResult,
  getGymsWithSessionsResult,
} from "@jits/shared/api/queries";
import type {
  GymDetailResult,
  PartialGymDetail,
} from "@jits/shared/api/queries";
import type { DashboardSummary } from "@jits/shared/types/composites";
import type {
  ActiveSessionInfo,
  GymDetail,
  GymListItem,
} from "@jits/shared/types/session";
import { Avatar32, EloTile, MetaTag, Wordmark } from "@/components/ui/elo-system";
import { ActiveSessionCard } from "@/components/dashboard/active-session-card";
import { SessionDiscoverySection } from "@/components/dashboard/session-discovery-section";
import { RecentActivitySection } from "@/components/dashboard/recent-activity-section";
import { StatOverview } from "@/components/dashboard/stat-overview";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { toast } from "@/components/ui/toast";
import {
  SkeletonProvider,
  SkeletonBlock,
  SkeletonPlate,
  SkeletonText,
  SkeletonParticipantRow,
} from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";

interface DashboardData {
  summary: DashboardSummary;
  activeSession: ActiveSessionInfo | null;
  /**
   * Primary gym with its sessions, powering the discovery surface. Typed as
   * PartialGymDetail because it may be salvaged from a failed read: the
   * capability booleans are not on it, and nothing here needs them.
   */
  gymDetail: PartialGymDetail | null;
  /** Gyms with a live session, loaded only for free agents (no primary gym). */
  liveGyms: GymListItem[];
  /**
   * True when a discovery read rejected. It must travel with the data: an empty
   * result and a failed result look identical downstream, and discovery is the
   * only path to a session, so claiming "nothing scheduled" on a dropped
   * request would tell an athlete their gym is dark while an open mat runs.
   */
  discoveryFailed: boolean;
}

function useDashboardData(
  athleteId: string | undefined,
  primaryGymId: string | null | undefined,
) {
  // Last gym payload that actually loaded, so a failed refresh falls back to it
  // instead of overwriting good data with null. The outer cache keeps stale data
  // on failure, but only for a rejected fetch: a swallowed inner failure
  // resolves and is written through as a success, which would defeat it.
  const lastGymDetail = React.useRef<{ gymId: string; detail: GymDetail } | null>(
    null,
  );

  /**
   * Turns a gym read into data plus an honest verdict on whether it worked.
   *
   * The verdict now comes from the query itself: getGymDetailResult returns
   * Result<GymDetail>, so `ok: false` means the read failed and `ok: true`
   * means the payload can be spoken for (jits-icei.5).
   *
   * It is still derived from the RESOLVED value and never from a rejection,
   * because supabase-js does not reject: postgrest-js sets
   * `shouldThrowOnError = false` and its outer handler converts even a hard
   * fetch error into a resolved `{ data: null, error }` (PostgrestBuilder.ts:82
   * and :372). A `.catch` can only ever catch a JS throw, never a failed
   * request.
   *
   * WHAT THIS REPLACES: the previous version inferred failure from a null
   * detail, which covered only a failure of getGymDetail's FIRST read, the gym
   * row. When the gym row loaded and the sessions read then failed, that error
   * was discarded too, the detail came back truthy with `sessions: []`, and
   * Home told the athlete "Nothing scheduled at <gym> right now" on a dropped
   * request. The query reports that case as a failure now, which is the hole
   * this closes.
   *
   * A FAILURE DOES NOT THROW THE DATA AWAY. `result.partial` carries whatever
   * the read did establish, and it is only offered when the session list is
   * trustworthy, so a failure in a part Home does not even consume (the manager
   * check, say) must not cost the athlete a live session at their own gym.
   * `failed` still travels either way: SessionDiscoverySection already decides
   * correctly from the two together, showing the error plate only when it has
   * nothing else to show.
   *
   * Preference order on failure: the fresh partial first, then the last payload
   * that fully loaded for this same gym, then nothing. The warm cache is
   * complete but stale; the partial is incomplete but current, and current wins
   * for the one thing this surface states, which is what is on right now.
   */
  const settleGymDetail = (
    gymId: string,
    result: GymDetailResult,
  ): { detail: PartialGymDetail | null; failed: boolean } => {
    if (result.ok) {
      lastGymDetail.current = { gymId, detail: result.data };
      return { detail: result.data, failed: false };
    }
    const cached = lastGymDetail.current;
    return {
      detail:
        result.partial ??
        (cached?.gymId === gymId ? cached.detail : null),
      failed: true,
    };
  };

  const { data, isLoading, isStale, error, refresh } = useCachedResource<DashboardData>(
    `dashboard:${athleteId}:${primaryGymId ?? "free-agent"}`,
    async (_signal) => {
      // All four reads are independent; keep them in one Promise.all. Exactly
      // one of the last two runs for real: an athlete with a primary gym gets
      // that gym's sessions, a free agent gets the live-gym list.
      const [summary, activeSession, gym, gyms] = await Promise.all([
        getDashboardSummary(supabase),
        getActiveSession(supabase, athleteId!),
        // Discovery data is additive: a failure must degrade the surface, never
        // blank the dashboard. Both reads report their outcome instead of
        // letting an empty result pass for a real one.
        primaryGymId
          ? getGymDetailResult(supabase, primaryGymId, athleteId!)
              .then((result) => settleGymDetail(primaryGymId, result))
              // Belt and braces. This path means a JS error thrown inside the
              // query function, NOT a failed request: those resolve as
              // `{ ok: false }` (see settleGymDetail), which is why the verdict
              // is derived there and not here. Same treatment either way.
              .catch((err) => {
                console.error("[dashboard] gym detail fetch threw", err);
                return settleGymDetail(primaryGymId, {
                  ok: false,
                  error: { code: "UNKNOWN", message: "Gym read threw." },
                  partial: null,
                });
              })
          : Promise.resolve({ detail: null, failed: false }),
        primaryGymId
          ? Promise.resolve({ list: [] as GymListItem[], failed: false })
          : getGymsWithSessionsResult(supabase)
              .then((result) =>
                result.ok
                  ? {
                      // An empty list is NOT a failure, unlike the gym read
                      // above: "no gym is live right now" is a legitimate
                      // answer, and the free-agent branch makes no claim about
                      // any particular gym (it shows the no-home-gym plate and
                      // the browse action either way), so there is no false
                      // statement to make. A failed read is a different thing
                      // and now says so.
                      list: result.data.filter((g) => g.hasActiveSession),
                      failed: false,
                    }
                  : { list: [] as GymListItem[], failed: true },
              )
              .catch((err) => {
                console.error("[dashboard] gym list fetch threw", err);
                return { list: [] as GymListItem[], failed: true };
              }),
      ]);
      return {
        summary,
        activeSession,
        gymDetail: gym.detail,
        liveGyms: gyms.list,
        discoveryFailed: gym.failed || gyms.failed,
      };
    },
    [athleteId, primaryGymId],
  );

  React.useEffect(() => {
    if (error) toast.error("Could not load dashboard");
  }, [error]);

  return { data, isLoading, isStale, refresh };
}

/** Cold-start placeholder mirroring EloTile + ActiveSessionCard + RecentActivity. */
function DashboardSkeleton() {
  return (
    <SkeletonProvider>
      <SkeletonBlock height={140} radius="md" />
      <SkeletonPlate variant="accent" className="mt-5">
        <SkeletonText lines={2} />
      </SkeletonPlate>
      <SkeletonPlate className="mt-5" style={{ gap: 8 }}>
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
        <SkeletonParticipantRow />
      </SkeletonPlate>
    </SkeletonProvider>
  );
}

export default function DashboardScreen() {
  const { athlete } = useRequireAthlete();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tokens = useThemedTokens();
  const { data, isLoading, isStale, refresh } = useDashboardData(
    athlete?.id,
    athlete?.primary_gym_id,
  );

  const onRefresh = React.useCallback(() => {
    // SWR keeps stale data on screen while revalidating; no artificial delay.
    refresh();
  }, [refresh]);

  if (!athlete) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  const stats = data?.summary.stats;

  const recentMatches = (data?.summary.recent_matches ?? []).map((m) => ({
    id: m.match_id,
    opponentName: m.opponent_name,
    result: m.outcome,
    eloDelta: m.elo_delta,
    date: m.completed_at,
  }));

  const recentActivity = (data?.summary.recent_activity ?? []).map((a) => ({
    id: a.match_id,
    winnerName: a.winner_name,
    loserName: a.loser_name,
    result: a.result,
    date: a.completed_at,
  }));

  return (
    <View className="flex-1 bg-surface">
      <View
        className="bg-surface-2 border-b border-hairline flex-row items-center justify-between px-4"
        style={{ paddingTop: insets.top, height: 56 + insets.top }}
      >
        <Wordmark size="md" />
        <View className="flex-row items-center gap-2">
          <NotificationBell athleteId={athlete.id} />
          <Avatar32
            name={athlete.display_name}
            photoUrl={athlete.profile_photo_url}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 32 + insets.bottom,
          gap: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isStale}
            onRefresh={onRefresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        <View>
          <MetaTag>Welcome back</MetaTag>
          <Text className="font-heading text-[26px] text-ink mt-2" numberOfLines={1}>
            {athlete.display_name}
          </Text>
        </View>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <EloTile
              size="hero"
              label="Current ELO Rating"
              value={athlete.current_elo}
              accentBar
            />

            <ActiveSessionCard session={data?.activeSession ?? null} />

            {/*
              Gym and session discovery. Sits directly under the active-session
              card so an athlete already training sees that first and everyone
              else sees the way into a session immediately below it. This is the
              only discovery path in the app now that the Gyms tab is gone.
            */}
            <SessionDiscoverySection
              gymId={athlete.primary_gym_id ?? null}
              gymName={data?.gymDetail?.name ?? null}
              sessions={data?.gymDetail?.sessions ?? []}
              rsvpSessionIds={data?.gymDetail?.rsvpSessionIds ?? []}
              participantSessionIds={data?.gymDetail?.participantSessionIds ?? []}
              liveGyms={data?.liveGyms ?? []}
              loadFailed={data?.discoveryFailed ?? false}
              onRetry={refresh}
            />

            <RecentActivitySection
              myMatches={recentMatches}
              allActivity={recentActivity}
              onPressMatch={() => toast.info("Match details coming soon")}
              onPressFindSession={() => router.push("/gyms")}
            />

            <StatOverview
              stats={{
                wins: stats?.wins ?? 0,
                losses: stats?.losses ?? 0,
                draws: stats?.draws ?? 0,
              }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

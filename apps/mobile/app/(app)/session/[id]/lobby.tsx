import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Shuffle, UserPlus } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { AppHeader } from "@/components/layout/app-header";
import { PageSurface } from "@/components/layout/page-container";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { LobbyHeader } from "@/components/session/lobby/lobby-header";
import { LeaveButton } from "@/components/session/lobby/leave-button";
import { ParticipantRow } from "@/components/session/lobby/participant-row";
import { showChallengeActionSheet } from "@/components/session/lobby/challenge-action-sheet";
import { useSessionLobby } from "@/lib/session/use-session-lobby";
import { useSessionLobbyRealtime } from "@/lib/session/use-session-lobby-realtime";
import {
  createInSessionMatch,
  requestRandomMatch,
} from "@jits/shared/api/mutations";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";
import { cn } from "@/lib/cn";
import type { LobbyParticipant } from "@jits/shared/types/session";

export default function SessionLobbyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();

  const {
    data,
    isLoading,
    error,
    refresh,
    participants,
    setParticipants,
  } = useSessionLobby(id);

  const onMatchStarted = React.useCallback(
    (matchId: string) => {
      router.replace(`/session/${id}/match/${matchId}`);
    },
    [id, router],
  );

  const { busyIds } = useSessionLobbyRealtime({
    sessionId: id,
    currentAthleteId: athlete?.id ?? "",
    setParticipants,
    onMatchStarted,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  const [randomLoading, setRandomLoading] = React.useState(false);
  const [challengeLoading, setChallengeLoading] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  async function handleChallenge(opponent: LobbyParticipant) {
    if (!athlete || challengeLoading) return;
    setChallengeLoading(true);
    // No timekeeper: the BE RPC rejects timekeeper_id matching either
    // competitor (HINT invalid_timekeeper). Mobile recording is per-device
    // (LiveStep uploads with the local athlete as uploader), so an explicit
    // timekeeper isn't required to capture video on this side.
    const result = await createInSessionMatch(supabase, {
      sessionId: id,
      opponentId: opponent.athleteId,
    });
    if (!result.ok) {
      setChallengeLoading(false);
      toast.error({
        text1: "Could not create match",
        description: result.error.message,
      });
      return;
    }
    router.replace(`/session/${id}/match/${result.data.matchId}`);
  }

  async function handleRandomMatch() {
    setRandomLoading(true);
    const result = await requestRandomMatch(supabase, id);
    setRandomLoading(false);
    if (!result.ok) {
      toast.error({
        text1: "No opponent available",
        description: result.error.message,
      });
      return;
    }
    router.replace(`/session/${id}/match/${result.data.matchId}`);
  }

  async function handleInvite() {
    const gymName = data?.gymName ?? "a gym";
    const url = buildShareUrl("session", id);
    const text = buildShareText({ type: "session", data: { gymName } });
    try {
      await Share.share({
        title: "Join my session on ELO RATED",
        message: `${text}\n${url}`,
        url,
      });
    } catch {
      toast.error("Could not share invite");
    }
  }

  if (authLoading || isLoading) {
    return (
      <PageSurface>
        <AppHeader title="Session Lobby" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      </PageSurface>
    );
  }

  if (!athlete) return null;

  if (error || !data) {
    return (
      <PageSurface>
        <AppHeader title="Session Lobby" back backFallback="/gyms" />
        <View className="flex-1 items-center justify-center px-6">
          <Plate className="items-center py-8">
            <Text className="font-heading text-[16px] text-ink text-center mb-2">
              Lobby unavailable
            </Text>
            <Text className="font-body text-[13px] text-ink-2 text-center">
              {error ?? "This session has ended or doesn’t exist."}
            </Text>
          </Plate>
        </View>
      </PageSurface>
    );
  }

  const visibleParticipants = participants
    .filter((p) => p.athleteId !== athlete.id && p.status !== "left" && p.status !== "done")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <PageSurface>
      <AppHeader
        title="Session Lobby"
        back
        backFallback="/gyms"
        rightAction={<LeaveButton sessionId={id} variant="compact" />}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 32,
          gap: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accentCta}
          />
        }
      >
        <LobbyHeader
          gymName={data.gymName}
          activeCount={visibleParticipants.length}
        />

        {/* Action button pair. Timekeeper is feature-flagged off (see lib/feature-flags
            on web); we mirror by exposing Random + Invite. */}
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={handleRandomMatch}
            disabled={randomLoading || visibleParticipants.length === 0}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-2 bg-cta py-3 rounded-sm",
              (randomLoading || visibleParticipants.length === 0) && "opacity-50",
              "active:bg-cta-hover",
            )}
          >
            <View pointerEvents="none">
              <Shuffle size={14} color={tokens.textOnAccent} />
            </View>
            <Text className="font-heading text-[12px] text-ink-on-cta uppercase tracking-caps">
              {randomLoading ? "Finding..." : "Random Match"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleInvite}
            className="flex-1 flex-row items-center justify-center gap-2 bg-surface-3 border border-hairline-strong py-3 rounded-sm active:bg-surface-4"
          >
            <View pointerEvents="none">
              <UserPlus size={14} color={tokens.textPrimary} />
            </View>
            <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
              Invite
            </Text>
          </Pressable>
        </View>

        <MetaTag>In Lobby ({visibleParticipants.length})</MetaTag>

        {visibleParticipants.length === 0 ? (
          <Plate className="items-center py-8">
            <Text className="font-body text-[13px] text-ink-2 text-center">
              No other fighters in the lobby yet. Pull to refresh.
            </Text>
          </Plate>
        ) : (
          <View className="gap-2">
            {visibleParticipants.map((p) => (
              <ParticipantRow
                key={p.athleteId}
                participant={p}
                onChallenge={(opponent) =>
                  showChallengeActionSheet(opponent, () =>
                    handleChallenge(opponent),
                  )
                }
                isBusy={busyIds.has(p.athleteId)}
              />
            ))}
          </View>
        )}

        {/* "You" plate anchors the athlete's own identity at the bottom of the
            list (C4 wireframe, lines 1105-1110). */}
        <Plate variant="live" className="mt-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
              You
            </Text>
            <Text className="font-mono-medium text-[14px] text-ink">
              {athlete.display_name} · {athlete.current_elo}
            </Text>
          </View>
        </Plate>

        <LeaveButton sessionId={id} variant="block" />
      </ScrollView>
    </PageSurface>
  );
}

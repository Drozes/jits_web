import * as React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Shuffle } from "lucide-react-native";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
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
      router.push(`/session/${id}/match/${matchId}`);
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

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  async function handleChallenge(opponent: LobbyParticipant, matchType: "casual" | "ranked") {
    if (!athlete) return;
    const result = await createInSessionMatch(supabase, {
      sessionId: id,
      opponentId: opponent.athleteId,
    });
    if (!result.ok) {
      toast.error({
        text1: "Could not create match",
        description: result.error.message,
      });
      return;
    }
    // Note: match-type selection isn't yet sent to the backend by
    // `createInSessionMatch` (RPC takes only sessionId + opponentId).
    // Web has the same limitation; A2 may extend the RPC.
    void matchType;
    router.push(`/session/${id}/match/${result.data.matchId}`);
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
    router.push(`/session/${id}/match/${result.data.matchId}`);
  }

  if (authLoading || isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Session Lobby" }} />
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator color={tokens.primary} />
        </View>
      </>
    );
  }

  if (!athlete) return null;

  if (error || !data) {
    return (
      <>
        <Stack.Screen options={{ title: "Session Lobby" }} />
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Text className="text-center text-base font-semibold text-foreground">
            Lobby unavailable
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {error ?? "This session has ended or doesn't exist."}
          </Text>
        </View>
      </>
    );
  }

  const visibleParticipants = participants
    .filter((p) => p.athleteId !== athlete.id && p.status !== "left" && p.status !== "done")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <>
      <Stack.Screen options={{ title: "Session Lobby", headerShown: true }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.primary} />
        }
      >
        <LobbyHeader gymName={data.gymName} activeCount={visibleParticipants.length} />

        {visibleParticipants.length === 0 ? (
          <Text className="py-8 text-center text-sm text-muted-foreground">
            No other fighters in the lobby yet.
          </Text>
        ) : (
          <View className="gap-2">
            {visibleParticipants.map((p) => (
              <ParticipantRow
                key={p.athleteId}
                participant={p}
                onChallenge={(opponent) =>
                  showChallengeActionSheet(opponent, (matchType) =>
                    handleChallenge(opponent, matchType),
                  )
                }
                isBusy={busyIds.has(p.athleteId)}
              />
            ))}
          </View>
        )}

        <Button
          variant="secondary"
          onPress={handleRandomMatch}
          disabled={randomLoading || visibleParticipants.length === 0}
          leftIcon={<Shuffle size={16} color={tokens.secondaryForeground} />}
        >
          {randomLoading ? "Finding opponent..." : "Find Random Match"}
        </Button>

        <LeaveButton sessionId={id} />
      </ScrollView>
    </>
  );
}

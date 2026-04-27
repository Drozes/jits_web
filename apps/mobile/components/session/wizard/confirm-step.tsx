import * as React from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { joinSessionLobby } from "@jits/shared/api/mutations";
import type { DomainErrorCode } from "@jits/shared/api/errors";

interface ConfirmStepProps {
  sessionId: string;
  gymName: string;
  confirmedWeight: number;
  currentAthleteId: string;
  currentAthleteName: string;
  currentAthleteElo: number;
  currentAthletePhotoUrl: string | null;
}

/** Map domain error codes to user-friendly messages for join failures. */
function joinErrorMessage(code: DomainErrorCode): string {
  switch (code) {
    case "SESSION_FULL":
      return "This session is full.";
    case "ALREADY_JOINED":
      return "You've already joined this session.";
    case "SESSION_NOT_ACTIVE":
      return "This session is not active.";
    case "SESSION_NOT_FOUND":
      return "Session not found.";
    case "WAIVER_REQUIRED":
      return "You must accept the waiver before joining.";
    case "RLS_VIOLATION":
      return "You don't have permission to join this session.";
    default:
      return "Could not join the session. Please try again.";
  }
}

/**
 * Native port of `apps/web/app/(app)/session/[id]/join/steps/confirm-step.tsx`.
 *
 * On submit:
 *   1. Calls `joinSessionLobby` (inserts into `session_participants`).
 *   2. Broadcasts `participant_joined` so existing lobby members see the new
 *      athlete without a refetch.
 *   3. Replaces navigation onto the lobby route.
 */
export function ConfirmStep({
  sessionId,
  gymName,
  confirmedWeight,
  currentAthleteId,
  currentAthleteName,
  currentAthleteElo,
  currentAthletePhotoUrl,
}: ConfirmStepProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleJoin() {
    setLoading(true);
    const result = await joinSessionLobby(supabase, { sessionId, confirmedWeight });
    if (!result.ok) {
      setLoading(false);
      toast.error({
        text1: "Could not join",
        description: joinErrorMessage(result.error.code),
      });
      return;
    }

    // Broadcast participant_joined so existing lobby members see the new athlete
    try {
      const channel = supabase.channel(`session:${sessionId}`);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "participant_joined",
        payload: {
          athleteId: currentAthleteId,
          displayName: currentAthleteName,
          currentElo: currentAthleteElo,
          currentWeight: confirmedWeight,
          profilePhotoUrl: currentAthletePhotoUrl,
          status: "checked_in",
        },
      });
      await supabase.removeChannel(channel);
    } catch (e) {
      // Broadcast failure is non-fatal; existing members will see them on
      // their next refetch (PG INSERT realtime trigger handles it too).
      console.warn("[join] participant_joined broadcast failed", e);
    }

    router.replace(`/session/${sessionId}/lobby`);
  }

  return (
    <View className="gap-4 py-2">
      <Text className="text-center text-base font-semibold text-foreground">
        Ready to join
      </Text>
      <Card className="rounded-2xl">
        <CardContent className="gap-2 p-4 pb-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Gym</Text>
            <Text className="text-sm font-medium text-foreground">{gymName}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Weight</Text>
            <Text className="text-sm font-medium text-foreground">
              {confirmedWeight} lbs
            </Text>
          </View>
        </CardContent>
      </Card>

      <Button onPress={handleJoin} disabled={loading}>
        {loading ? "Joining..." : "Join Lobby"}
      </Button>
    </View>
  );
}

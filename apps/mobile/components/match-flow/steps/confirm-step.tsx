import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { confirmMatchResult } from "@jits/shared/api/mutations";
import {
  useSessionMatchSync,
  type BroadcastResult,
} from "@jits/shared/hooks/use-session-match-sync";
import { useMatchCompletion } from "@/lib/match-flow/use-match-completion";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { ConfirmPanel, ResultBanner } from "./confirm-step-panels";
import { DisputeForm } from "./dispute-form";

interface ConfirmStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  matchStatus: string;
  currentAthleteId: string;
  opponentId: string;
  opponentDisplayName: string;
  resultData: BroadcastResult | null;
  onCompleted: () => void;
}

/**
 * Step 7 -- both athletes confirm the recorded result. Either side can
 * dispute (which surfaces a reason input). When the matches row flips
 * to `completed` or `disputed` we advance to the summary so the user
 * isn't stranded.
 */
export function ConfirmStep(props: ConfirmStepProps) {
  const { matchId, matchType, matchStatus, currentAthleteId, opponentId, opponentDisplayName, resultData, onCompleted } = props;
  const [myConfirmed, setMyConfirmed] = React.useState(false);
  const [opponentConfirmed, setOpponentConfirmed] = React.useState(false);
  const [showDispute, setShowDispute] = React.useState(false);

  const { fire: advance } = useMatchCompletion({ matchId, matchStatus, onCompleted });

  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponentId) setOpponentConfirmed(true);
    },
  });

  async function handleConfirm() {
    if (myConfirmed) return;
    setMyConfirmed(true);
    // Route through the offline-tolerant queue. Online runs immediately;
    // offline queues under a stable per-athlete key and the queue auto-
    // flushes on reconnect. Last write wins for the same key.
    const res = await mutationQueue.enqueue(
      `confirm-result:${matchId}:${currentAthleteId}`,
      () => confirmMatchResult(supabase, matchId),
    );
    if (!res.ok) {
      setMyConfirmed(false);
      toast.error({ text1: "Couldn't confirm", description: res.error.message });
      return;
    }
    if (isQueuedResult(res.data)) {
      toast.success({
        text1: "Saved locally",
        description: "Confirmation will sync when you're back online.",
      });
    }
    // Broadcast is a no-op offline; opponent will see the confirmation
    // via postgres-changes once our queued write lands on reconnect.
    sync.broadcastResultConfirmed(currentAthleteId);
  }

  if (showDispute) {
    return (
      <DisputeForm
        matchId={matchId}
        onCancel={() => setShowDispute(false)}
        onSubmitted={advance}
      />
    );
  }

  return (
    <View className="gap-5 px-1 py-4">
      <ResultBanner
        resultData={resultData}
        currentAthleteId={currentAthleteId}
        matchType={matchType}
      />
      <View className="flex-row gap-3">
        <ConfirmPanel label="You" confirmed={myConfirmed} />
        <ConfirmPanel label={opponentDisplayName} confirmed={opponentConfirmed} />
      </View>
      {!myConfirmed ? (
        <Button onPress={handleConfirm} size="lg" leftIcon={<Check size={16} color="white" />}>
          Confirm Result
        </Button>
      ) : !opponentConfirmed ? (
        <Text className="text-center text-sm text-muted-foreground">
          Waiting for opponent to confirm...
        </Text>
      ) : null}
      {!myConfirmed ? (
        <Pressable onPress={() => setShowDispute(true)}>
          <Text className="text-center text-xs text-muted-foreground underline">
            Dispute result
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

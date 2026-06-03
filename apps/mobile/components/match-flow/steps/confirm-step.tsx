import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
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
import { cn } from "@/lib/cn";

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
 * Step 7: both athletes confirm the recorded result. Either side can
 * dispute (which surfaces a reason input). When the matches row flips
 * to `completed` or `disputed` we advance to the summary so the user
 * isn't stranded.
 *
 * ELO design system: hero ResultBanner verdict, two ConfirmPanels, a
 * Signal Red confirm cta, and an underlined dispute escape. Mirrors D9
 * wireframe (lines 1275-1323).
 */
export function ConfirmStep(props: ConfirmStepProps) {
  const tokens = useThemedTokens();
  const {
    matchId,
    matchType,
    matchStatus,
    currentAthleteId,
    opponentId,
    opponentDisplayName,
    resultData,
    onCompleted,
  } = props;
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

  // Auto-advance when both sides have confirmed locally. The realtime
  // postgres_changes listener in useMatchCompletion may fire first, but
  // if the DB update is delayed (or matchStatus prop is stale from the
  // initial fetch), this ensures the user is never stranded.
  React.useEffect(() => {
    if (myConfirmed && opponentConfirmed) {
      const t = setTimeout(advance, 1500);
      return () => clearTimeout(t);
    }
  }, [myConfirmed, opponentConfirmed, advance]);

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
        <Pressable
          accessibilityRole="button"
          onPress={handleConfirm}
          className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover flex-row gap-2"
        >
          <Check size={16} color={tokens.textOnAccent} />
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            Confirm Result
          </Text>
        </Pressable>
      ) : !opponentConfirmed ? (
        <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Waiting for opponent to confirm...
        </Text>
      ) : null}

      {!myConfirmed ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowDispute(true)}
          className="items-center py-2 active:opacity-70"
          hitSlop={8}
        >
          <Text
            className={cn(
              "font-mono text-[10px] text-ink-3 uppercase tracking-caps-l",
              "underline",
            )}
          >
            Dispute result
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

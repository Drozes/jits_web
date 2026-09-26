import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { confirmMatchResult } from "@jits/shared/api/mutations";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import {
  SEND_GRACE_MS,
  useMatchSyncContext,
  useStepMatchSync,
} from "@/lib/match-flow/match-sync-context";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { ConfirmPanel, ResultBanner } from "./confirm-step-panels";
import { DisputeForm } from "./dispute-form";
import { cn } from "@/lib/cn";

interface ConfirmStepProps {
  matchId: string;
  matchType: "ranked" | "casual";
  currentAthleteId: string;
  opponentId: string;
  opponentDisplayName: string;
  resultData: BroadcastResult | null;
  /** Athletes the DB has a confirmation for (from the wizard's reconciler),
   * so a missed result_confirmed, or a remount, cannot hide one. */
  confirmedAthleteIds: string[];
  onCompleted: () => void;
}

/** After this athlete has confirmed, how long before they may stop waiting
 * on an opponent who never confirms (the result and ELO are already final
 * at record time; the confirmation does not change them). */
const LEAVE_AFTER_MS = 20_000;

/**
 * Step 7: both athletes confirm the recorded result. Either side can
 * dispute (which surfaces a reason input). Advances to the summary when
 * both have confirmed or either has disputed.
 *
 * Signals, fastest first: the result_confirmed / match_disputed broadcasts;
 * then the wizard's reconciler (it polls this step and re-reads the match on
 * foreground and on every channel rejoin), which feeds `confirmedAthleteIds`
 * and moves the wizard to the summary itself once both rows exist or the
 * match is disputed. `completed` alone is NOT a signal here:
 * record_match_result sets it at record time, before anyone confirmed.
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
    currentAthleteId,
    opponentId,
    opponentDisplayName,
    resultData,
    confirmedAthleteIds,
    onCompleted,
  } = props;
  const [myConfirmedLocal, setMyConfirmed] = React.useState(false);
  const [opponentConfirmedLocal, setOpponentConfirmed] = React.useState(false);
  const [showDispute, setShowDispute] = React.useState(false);
  const [canLeave, setCanLeave] = React.useState(false);
  const { reconcileNow } = useMatchSyncContext();
  const myConfirmed = myConfirmedLocal || confirmedAthleteIds.includes(currentAthleteId);
  const opponentConfirmed = opponentConfirmedLocal || confirmedAthleteIds.includes(opponentId);

  const advancedRef = React.useRef(false);
  const onCompletedRef = React.useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const advance = React.useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onCompletedRef.current();
  }, []);

  const sync = useStepMatchSync({
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponentId) setOpponentConfirmed(true);
    },
    onMatchDisputed: (athleteId) => {
      // The opponent disputed: nothing left to confirm (jits-wfpo).
      if (athleteId === currentAthleteId) return;
      toast.info({
        text1: "Result disputed",
        description: `${opponentDisplayName} disputed the result. An admin will review it.`,
      });
      advance();
    },
  });

  // Auto-advance when both sides have confirmed.
  React.useEffect(() => {
    if (myConfirmed && opponentConfirmed) {
      const t = setTimeout(advance, 1500);
      return () => clearTimeout(t);
    }
  }, [myConfirmed, opponentConfirmed, advance]);

  // An opponent who closes the app never confirms; do not hold this athlete
  // on the confirm step forever for a formality.
  React.useEffect(() => {
    if (!myConfirmed || opponentConfirmed) return;
    const t = setTimeout(() => setCanLeave(true), LEAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [myConfirmed, opponentConfirmed]);

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
      // Most often the opponent disputed and that signal was missed.
      reconcileNow();
      return;
    }
    if (isQueuedResult(res.data)) {
      toast.success({
        text1: "Saved locally",
        description: "Confirmation will sync when you're back online.",
      });
    }
    // Broadcast is a no-op offline; the opponent's reconciler reads the
    // confirmation from the DB once our queued write lands.
    void sync.broadcastResultConfirmed(currentAthleteId);
  }

  async function handleDisputed() {
    // Tell the opponent before this step (and its channel) goes away; they
    // would otherwise wait on a confirmation that can never come.
    await settleWithin(sync.broadcastMatchDisputed(currentAthleteId), SEND_GRACE_MS);
    advance();
  }

  if (showDispute) {
    return (
      <DisputeForm
        matchId={matchId}
        onCancel={() => setShowDispute(false)}
        onSubmitted={() => void handleDisputed()}
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
          testID="confirm-result"
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

      {myConfirmed && !opponentConfirmed && canLeave ? (
        <Pressable
          testID="confirm-leave"
          accessibilityRole="button"
          onPress={advance}
          className="items-center py-2 active:opacity-70"
          hitSlop={8}
        >
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l underline">
            Continue without waiting
          </Text>
        </Pressable>
      ) : null}

      {!myConfirmed ? (
        <Pressable
          testID="confirm-dispute"
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

import * as React from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { cancelSessionMatch, startMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import {
  SEND_GRACE_MS,
  useMatchSyncContext,
  useStepMatchSync,
} from "@/lib/match-flow/match-sync-context";
import { ReadyPanel } from "./ready-panel";
import { cn } from "@/lib/cn";

/** How often a ready athlete repeats ready_signal until the opponent's arrives. */
const READY_REPEAT_MS = 3_000;

interface ReadyStepProps {
  /** Where a cancelled ready check returns to (the Arena, on mobile). */
  exitHref: string;
  /** The opponent cancelled: the wizard's `exitCancelled`, which toasts and
   * navigates once and stops the reconciler from exiting a second time. */
  onCancelledRemotely: (description?: string) => void;
  matchId: string;
  currentAthleteId: string;
  opponentId: string;
  /** Shown on the opponent's panel; falls back to "Opponent". */
  opponentName?: string | null;
  /** Called once start_match completes (or the broadcast says it did). */
  onStarted: (startedAt: string) => void;
}

/**
 * Step 3: both athletes tap Ready, then the *initiator* fires
 * `start_match` and broadcasts `timer_started`. The other client
 * receives the broadcast and advances. Mirrors web's ready-check-step.
 *
 * ELO design system: meta-strip header, two ReadyPanels side by side,
 * primary cta in Signal Red. Waiting copy uses mono caps. Mirrors D5
 * wireframe (lines 1175-1202).
 */
export function ReadyStep(props: ReadyStepProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const {
    exitHref,
    onCancelledRemotely,
    matchId,
    currentAthleteId,
    opponentId,
    opponentName,
    onStarted,
  } = props;
  const [myReady, setMyReady] = React.useState(false);
  const [opponentReady, setOpponentReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const startedRef = React.useRef(false);
  const cancelledRef = React.useRef(false);

  const { markExiting } = useMatchSyncContext();
  const sync = useStepMatchSync({
    matchId,
    onReadySignal: (athleteId) => {
      if (athleteId === opponentId) setOpponentReady(true);
    },
    onTimerStarted: (startedAt) => {
      if (startedRef.current) return;
      startedRef.current = true;
      onStarted(startedAt);
    },
    onMatchCancelled: () => {
      // The opponent cancelled. Leave through the wizard's single exit, like
      // the weight step: toasting and navigating here directly left the
      // reconciler free to see status=cancelled on its next poll and toast
      // and navigate a second time. `exitCancelled` marks the wizard exiting.
      // Guard so we only act once and not after we ourselves cancelled.
      if (cancelledRef.current || startedRef.current) return;
      cancelledRef.current = true;
      onCancelledRemotely("Your opponent left the ready check.");
    },
  });

  const handleStart = React.useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    const result = await startMatch(supabase, matchId);
    if (!result.ok) {
      // Both devices race to start_match when the ready handshake completes
      // and the RPC only succeeds once (pending -> in_progress). Losing the
      // race is NOT an error: check the DB before surfacing one. Without
      // this, a missed timer-started broadcast strands the losing device on
      // the ready step with a misleading toast while the match runs.
      const match = await getMatchDetails(supabase, matchId);
      if (match?.status === "in_progress" && match.started_at) {
        onStarted(match.started_at);
        return;
      }
      startedRef.current = false;
      setLoading(false);
      toast.error({ text1: "Couldn't start match", description: result.error.message });
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    // Let timer_started leave the device before onStarted unmounts this
    // step and its channel (jits-mzfu). Bounded; the opponent's ready step
    // also polls the DB and sees in_progress if this is lost anyway.
    await settleWithin(sync.broadcastTimerStarted(startedAt), SEND_GRACE_MS);
    onStarted(startedAt);
  }, [matchId, sync, onStarted]);

  React.useEffect(() => {
    if (myReady && opponentReady && !startedRef.current && !loading) {
      void handleStart();
    }
  }, [myReady, opponentReady, loading, handleStart]);

  function handleTapReady() {
    if (myReady) return;
    setMyReady(true);
    void sync.broadcastReady(currentAthleteId);
  }

  // Ready is the one signal the DB cannot back up (there is no ready column),
  // so a ready_signal sent before the opponent's ready step had joined was
  // simply gone, and two ready athletes could wait on each other forever.
  // Repeat ours until theirs arrives; receiving it twice is harmless.
  // Keyed on the (stable) callback, not the per-render `sync` object, so a
  // wizard re-render (the reconciler applies a snapshot every poll) does
  // not keep resetting the interval before it fires.
  const { broadcastReady } = sync;
  React.useEffect(() => {
    if (!myReady || opponentReady) return;
    const id = setInterval(() => {
      if (!startedRef.current && !cancelledRef.current) void broadcastReady(currentAthleteId);
    }, READY_REPEAT_MS);
    return () => clearInterval(id);
  }, [myReady, opponentReady, broadcastReady, currentAthleteId]);

  const doCancel = React.useCallback(async () => {
    if (cancelledRef.current || startedRef.current) return;
    cancelledRef.current = true;
    setCancelling(true);
    const result = await cancelSessionMatch(supabase, matchId);
    if (!result.ok) {
      cancelledRef.current = false;
      setCancelling(false);
      toast.error({ text1: "Could not cancel", description: result.error.message });
      return;
    }
    // Tell the opponent's ready step to abort too, then head back out. The
    // wizard is told first so its reconciler, which may see status=cancelled
    // while the broadcast settles, does not also navigate.
    markExiting();
    await settleWithin(sync.broadcastMatchCancelled(), SEND_GRACE_MS);
    router.replace(exitHref);
  }, [matchId, exitHref, sync, router, markExiting]);

  function handleCancelPress() {
    if (cancelling || loading || startedRef.current) return;
    Alert.alert(
      "Cancel match?",
      "Your opponent will be returned to the lobby.",
      [
        { text: "Keep Waiting", style: "cancel" },
        { text: "Cancel Match", style: "destructive", onPress: () => void doCancel() },
      ],
    );
  }

  // Cancel/leave is available until the match actually starts. Hidden once
  // both athletes are ready (the start is already firing) or while starting.
  const canCancel = !startedRef.current && !loading;

  return (
    <View className="gap-5 px-1 py-4">
      <View className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Ready Check
        </Text>
        <Text className="font-body text-[13px] text-ink-2 text-center">
          Both athletes must tap Ready to start.
        </Text>
      </View>

      <View className="flex-row gap-3">
        <ReadyPanel label="You" ready={myReady} />
        {/* Named, but the testID and the "Opponent, ready|waiting" label
            stay fixed: the match-loop harness reads both. */}
        <ReadyPanel
          label={opponentName?.trim() || "Opponent"}
          ready={opponentReady}
          testID="ready-panel-opponent"
          accessibilityName="Opponent"
        />
      </View>

      {!myReady ? (
        <Pressable
          testID="ready-button"
          accessibilityRole="button"
          onPress={handleTapReady}
          disabled={loading}
          className={cn(
            "bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover",
            loading && "opacity-50",
          )}
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            Ready
          </Text>
        </Pressable>
      ) : !opponentReady ? (
        <Text className="text-center font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Waiting for opponent...
        </Text>
      ) : null}

      {canCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel match"
          onPress={handleCancelPress}
          disabled={cancelling}
          className={cn("items-center px-2 py-2", cancelling && "opacity-50", "active:opacity-70")}
          hitSlop={8}
        >
          <Text className="font-heading text-[11px] text-negative uppercase tracking-caps">
            {cancelling ? "Cancelling..." : "Cancel Match"}
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View className="items-center gap-2">
          <ActivityIndicator color={tokens.textSecondary} />
          <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
            Starting match...
          </Text>
        </View>
      ) : null}
    </View>
  );
}

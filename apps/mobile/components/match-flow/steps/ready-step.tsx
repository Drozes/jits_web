import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { startMatch } from "@jits/shared/api/mutations";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { ReadyPanel } from "./ready-panel";
import { cn } from "@/lib/cn";

interface ReadyStepProps {
  matchId: string;
  currentAthleteId: string;
  opponentId: string;
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
  const { matchId, currentAthleteId, opponentId, onStarted } = props;
  const [myReady, setMyReady] = React.useState(false);
  const [opponentReady, setOpponentReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const startedRef = React.useRef(false);

  const sync = useSessionMatchSync({
    supabase,
    matchId,
    onReadySignal: (athleteId) => {
      if (athleteId === opponentId) setOpponentReady(true);
    },
    onTimerStarted: (startedAt) => {
      if (startedRef.current) return;
      startedRef.current = true;
      onStarted(startedAt);
    },
  });

  const handleStart = React.useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setLoading(true);
    const result = await startMatch(supabase, matchId);
    if (!result.ok) {
      startedRef.current = false;
      setLoading(false);
      toast.error({ text1: "Couldn't start match", description: result.error.message });
      return;
    }
    const startedAt = result.data.started_at ?? new Date().toISOString();
    sync.broadcastTimerStarted(startedAt);
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
    sync.broadcastReady(currentAthleteId);
  }

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
        <ReadyPanel label="Opponent" ready={opponentReady} />
      </View>

      {!myReady ? (
        <Pressable
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

import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface WaitStepProps {
  /** Optional headline message (defaults to "Waiting..."). */
  message?: string;
  /** Whether to show a "Continue" escape after the timeout fires. */
  allowSkip?: boolean;
  /** Called when the user taps Continue (only rendered if allowSkip). */
  onSkip?: () => void;
  /** Timeout in ms before the skip button appears (default 30s). */
  timeoutMs?: number;
}

/**
 * Step 1 -- generic "waiting on something" screen. Used as a fallback
 * while we wait for the opponent to ready up or for a broadcast to land.
 * Mirrors the web's `timekeeper-wait-step` but is opponent-agnostic.
 */
export function WaitStep({ message, allowSkip, onSkip, timeoutMs = 30_000 }: WaitStepProps) {
  const tokens = useThemedTokens();
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (!allowSkip) return;
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [allowSkip, timeoutMs]);

  return (
    <View className="items-center justify-center gap-4 px-4 py-12">
      {!timedOut ? (
        <>
          <ActivityIndicator size="large" color={tokens.mutedForeground} />
          <Text className="text-center text-sm text-muted-foreground">
            {message ?? "Waiting..."}
          </Text>
        </>
      ) : (
        <>
          <Text className="text-center text-sm text-muted-foreground">
            Still waiting. Continue without?
          </Text>
          {onSkip ? <Button onPress={onSkip}>Continue</Button> : null}
        </>
      )}
    </View>
  );
}

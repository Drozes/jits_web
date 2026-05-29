import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { Plate } from "@/components/ui/elo-system";

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
 * Step 1: generic "waiting on something" screen. Used as a fallback
 * while we wait for the opponent to ready up or for a broadcast to land.
 * Mirrors the web's `timekeeper-wait-step` but is opponent-agnostic.
 *
 * ELO design system: centered plate with meta strip + spinner. After the
 * timeout fires, swap the spinner for a Continue cta so the user is
 * never stranded.
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
    <View className="px-1 py-8">
      <Plate className="items-center gap-4 py-8">
        {!timedOut ? (
          <>
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
              Waiting
            </Text>
            <ActivityIndicator size="large" color={tokens.textSecondary} />
            <Text className="text-center font-body text-[13px] text-ink-2">
              {message ?? "Waiting..."}
            </Text>
          </>
        ) : (
          <>
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
              Still waiting
            </Text>
            <Text className="text-center font-body text-[13px] text-ink-2">
              Continue without?
            </Text>
            {onSkip ? (
              <Pressable
                accessibilityRole="button"
                onPress={onSkip}
                className="mt-2 bg-cta items-center justify-center py-3 px-5 rounded-sm active:bg-cta-hover"
              >
                <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
                  Continue
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Plate>
    </View>
  );
}

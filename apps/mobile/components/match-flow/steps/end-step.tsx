import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface EndStepProps {
  /** Auto-advance after this many ms (default 800ms so the user actually
   * sees the visual confirmation that the timer stopped). */
  delayMs?: number;
  onAdvance: () => void;
}

/**
 * Step 5 -- transient "match ended, hold on" screen. Auto-advances to
 * the result step after a short delay. Web folds this into the live
 * step but a separate frame on mobile makes the end -> result transition
 * feel less abrupt and gives haptic / animation room.
 */
export function EndStep({ delayMs = 800, onAdvance }: EndStepProps) {
  const tokens = useThemedTokens();
  React.useEffect(() => {
    const t = setTimeout(onAdvance, delayMs);
    return () => clearTimeout(t);
  }, [delayMs, onAdvance]);

  return (
    <View className="items-center justify-center gap-4 px-4 py-12">
      <CheckCircle2 size={48} color={tokens.success} />
      <Text className="text-lg font-heading text-foreground">Match Ended</Text>
      <ActivityIndicator color={tokens.mutedForeground} />
      <Text className="text-sm text-muted-foreground">Recording result...</Text>
    </View>
  );
}

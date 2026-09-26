import * as React from "react";
import { Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { Plate } from "@/components/ui/elo-system";

interface EndStepProps {
  /** Auto-advance after this many ms (default 800ms so the user actually
   * sees the visual confirmation that the timer stopped). */
  delayMs?: number;
  onAdvance: () => void;
}

/**
 * Step 5: transient "match ended, hold on" screen. Auto-advances to
 * the result step after a short delay. Web folds this into the live
 * step but a separate frame on mobile makes the end -> result transition
 * feel less abrupt and gives haptic / animation room.
 *
 * ELO design system: default plate with an ink check (Gain Green is for
 * rating increases only), brief heading, and a pointer to the next step.
 */
export function EndStep({ delayMs = 800, onAdvance }: EndStepProps) {
  const tokens = useThemedTokens();
  React.useEffect(() => {
    const t = setTimeout(onAdvance, delayMs);
    return () => clearTimeout(t);
  }, [delayMs, onAdvance]);

  return (
    <View className="px-1 py-8">
      <Plate className="items-center gap-4 py-8">
        <CheckCircle2 size={48} color={tokens.textPrimary} />
        <Text className="font-display text-[28px] text-ink tracking-mark">
          MATCH ENDED
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Up next: record the result
        </Text>
      </Plate>
    </View>
  );
}

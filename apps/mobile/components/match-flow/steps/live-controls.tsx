import { Pressable, Text, View } from "react-native";
import { Pause, Play, Square } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface LiveControlsProps {
  paused: boolean;
  disabled: boolean;
  onPauseResume: () => void;
  onEnd: () => void;
}

/**
 * Pause / Resume + End match button row used by the live step.
 *
 * ELO design system: secondary outline for Pause / Resume, Signal Red
 * primary for End Match. Mirrors D7 wireframe (lines 1232-1235).
 */
export function LiveControls({ paused, disabled, onPauseResume, onEnd }: LiveControlsProps) {
  const tokens = useThemedTokens();
  return (
    <View className="w-full flex-row gap-3 pt-4">
      <Pressable
        accessibilityRole="button"
        onPress={onPauseResume}
        disabled={disabled}
        className={cn(
          "flex-1 flex-row items-center justify-center gap-2 border border-hairline-strong rounded-sm bg-surface-3 py-3 active:bg-surface-4",
          disabled && "opacity-50",
        )}
      >
        <View pointerEvents="none">
          {paused ? (
            <Play size={16} color={tokens.textPrimary} />
          ) : (
            <Pause size={16} color={tokens.textPrimary} />
          )}
        </View>
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
          {paused ? "Resume" : "Pause"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onEnd}
        disabled={disabled}
        className={cn(
          "flex-1 flex-row items-center justify-center gap-2 bg-cta rounded-sm py-3 active:bg-cta-hover",
          disabled && "opacity-50",
        )}
      >
        <View pointerEvents="none">
          <Square size={16} color={tokens.textOnAccent} />
        </View>
        <Text className="font-heading text-[12px] text-ink-on-cta uppercase tracking-caps">
          End Match
        </Text>
      </Pressable>
    </View>
  );
}

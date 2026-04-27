import * as React from "react";
import { View } from "react-native";
import { Pause, Play, Square } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface LiveControlsProps {
  paused: boolean;
  disabled: boolean;
  onPauseResume: () => void;
  onEnd: () => void;
}

/**
 * Pause/Resume + End match button row used by the live step. Splitting
 * this out keeps the live step itself near the 100-line target.
 */
export function LiveControls({ paused, disabled, onPauseResume, onEnd }: LiveControlsProps) {
  const tokens = useThemedTokens();
  return (
    <View className="w-full flex-row gap-3 pt-4">
      <Button
        variant="outline"
        size="lg"
        className="flex-1"
        onPress={onPauseResume}
        disabled={disabled}
        leftIcon={
          paused ? (
            <Play size={16} color={tokens.foreground} />
          ) : (
            <Pause size={16} color={tokens.foreground} />
          )
        }
      >
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button
        variant="destructive"
        size="lg"
        className="flex-1"
        onPress={onEnd}
        disabled={disabled}
        leftIcon={<Square size={16} color={tokens.destructiveForeground} />}
      >
        End Match
      </Button>
    </View>
  );
}

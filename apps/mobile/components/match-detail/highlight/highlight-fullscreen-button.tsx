import * as React from "react";
import { Pressable } from "react-native";
import { Maximize2 } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";

/** Native fullscreen for the reel (the only overlay control; no share/save). */
export function HighlightFullscreenButton({ onPress }: { onPress: () => void }) {
  const tokens = useThemedTokens();
  return (
    <Pressable
      testID="highlight-fullscreen"
      accessibilityRole="button"
      accessibilityLabel={HIGHLIGHT_COPY.fullscreen}
      hitSlop={10}
      onPress={onPress}
      className="absolute right-2 bottom-2 p-2 bg-surface-3 border border-hairline rounded-xs"
    >
      <Maximize2 size={16} color={tokens.textPrimary} />
    </Pressable>
  );
}

import * as React from "react";
import { Pressable } from "react-native";
import { ThumbsDown, ThumbsUp } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";

interface ThumbProps {
  kind: "up" | "down";
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testIDPrefix: string;
}

/** A secondary icon toggle ("Good reel" / "Bad reel"); never Signal Red. */
export function HighlightThumb({ kind, selected, disabled, onPress, testIDPrefix }: ThumbProps) {
  const tokens = useThemedTokens();
  const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
  return (
    <Pressable
      testID={`${testIDPrefix}-${kind}`}
      accessibilityRole="button"
      accessibilityLabel={kind === "up" ? HIGHLIGHT_COPY.goodReel : HIGHLIGHT_COPY.badReel}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={cn(
        "items-center justify-center rounded-sm border",
        selected ? "bg-surface-4 border-ink" : "border-hairline-strong active:bg-surface-4",
        disabled && "opacity-50",
      )}
      style={{ width: 44, height: 44 }}
    >
      <Icon size={18} color={selected ? tokens.textPrimary : tokens.textTertiary} />
    </Pressable>
  );
}

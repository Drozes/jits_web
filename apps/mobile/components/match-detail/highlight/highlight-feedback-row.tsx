import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import type { HighlightRating } from "@/lib/highlight/use-highlight-rating";
import { HighlightThumb } from "./highlight-thumbs";

interface HighlightFeedbackRowProps {
  rating: HighlightRating | null;
  improveDisabled: boolean;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onImprove: () => void;
}

/** Thumbs pair plus the secondary outline "Improve this reel" (no red on the card). */
export function HighlightFeedbackRow(props: HighlightFeedbackRowProps) {
  const { rating, improveDisabled, onThumbsUp, onThumbsDown, onImprove } = props;
  return (
    <View className="flex-row items-center gap-2">
      <HighlightThumb kind="up" testIDPrefix="highlight-thumb" selected={rating === 1} onPress={onThumbsUp} />
      <HighlightThumb kind="down" testIDPrefix="highlight-thumb" selected={rating === -1} onPress={onThumbsDown} />
      <Pressable
        testID="highlight-improve"
        accessibilityRole="button"
        accessibilityLabel={HIGHLIGHT_COPY.improve}
        accessibilityState={{ disabled: improveDisabled }}
        disabled={improveDisabled}
        onPress={onImprove}
        className={cn(
          "flex-1 items-center justify-center rounded-sm border border-hairline-strong px-4",
          improveDisabled ? "opacity-50" : "active:bg-surface-4",
        )}
        style={{ height: 44 }}
      >
        <Text className="font-heading text-[12px] uppercase tracking-caps text-ink">
          {HIGHLIGHT_COPY.improve}
        </Text>
      </Pressable>
    </View>
  );
}

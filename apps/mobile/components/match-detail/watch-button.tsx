import * as React from "react";
import { Pressable, Text } from "react-native";
import { cn } from "@/lib/cn";
import type { MatchDetailVideo } from "@jits/shared/api/queries";

interface WatchButtonProps {
  video: MatchDetailVideo;
  primary: boolean;
  onWatch: () => void;
}

/** "Your recording" reads "Watch your recording"; a name keeps its case. */
function watchLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Watch your recording" : `Watch ${angleLabel}`;
}

/**
 * Watch for one recording: Signal Red when it is the surface's primary,
 * secondary otherwise, disabled "Processing..." while still uploading.
 * testID `match-video-watch-<id>` is the harness tap target.
 */
export function WatchButton({ video, primary, onWatch }: WatchButtonProps) {
  const processing = video.playability === "processing";
  return (
    <Pressable
      testID={`match-video-watch-${video.id}`}
      accessibilityRole="button"
      accessibilityLabel={processing ? "Processing" : watchLabel(video.angle_label)}
      accessibilityState={{ disabled: processing }}
      disabled={processing}
      onPress={onWatch}
      className={cn(
        "items-center justify-center rounded-sm px-5 py-3",
        processing
          ? "bg-surface-4 opacity-60"
          : primary
            ? "bg-cta active:opacity-70"
            : "bg-surface-3 border border-hairline-strong active:bg-surface-4",
      )}
    >
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          primary && !processing ? "text-ink-on-cta" : "text-ink",
        )}
      >
        {processing ? "Processing..." : "Watch"}
      </Text>
    </Pressable>
  );
}

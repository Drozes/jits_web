import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { PlayCircle } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { MatchVideoStatus } from "./match-video-status";

interface MatchVideoCardProps {
  video: MatchDetailVideo;
  /** The one Signal Red Watch on the screen; any other card is secondary. */
  primary: boolean;
  onWatch: () => void;
}

/** "Your recording" reads "Watch your recording"; a name keeps its case. */
function watchLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Watch your recording" : `Watch ${angleLabel}`;
}

/** One recording: poster (or placeholder), angle label, status, Watch. */
export function MatchVideoCard({ video, primary, onWatch }: MatchVideoCardProps) {
  const tokens = useThemedTokens();
  const duration = formatVideoDuration(video.duration_seconds);
  const processing = video.playability === "processing";

  return (
    <View
      testID={`match-video-card-${video.id}`}
      className="bg-surface-3 border border-hairline rounded-md overflow-hidden"
    >
      <View className="bg-surface-4 items-center justify-center" style={{ aspectRatio: 16 / 9 }}>
        {video.poster_url ? (
          <Image
            testID="match-video-poster"
            source={{ uri: video.poster_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View testID="match-video-placeholder" pointerEvents="none">
            <PlayCircle size={32} color={tokens.textTertiary} />
          </View>
        )}
      </View>
      <View className="p-4 gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="flex-1 font-heading text-[12px] text-ink">
            {video.angle_label}
          </Text>
          {duration ? (
            <Text className="font-mono text-[12px] text-ink-3 tabular-nums">{duration}</Text>
          ) : null}
        </View>
        <MatchVideoStatus video={video} />
        <Pressable
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
      </View>
    </View>
  );
}

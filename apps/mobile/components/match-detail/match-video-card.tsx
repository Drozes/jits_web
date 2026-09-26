import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { PlayCircle } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatVideoDuration } from "@jits/shared/utils";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { MatchVideoStatus } from "./match-video-status";
import { WatchButton } from "./watch-button";

interface MatchVideoCardProps {
  video: MatchDetailVideo;
  /** The one Signal Red Watch on the screen; any other card is secondary. */
  primary: boolean;
  onWatch: () => void;
}

/** "Your recording" reads "Play your recording"; a name keeps its case. */
function playLabel(angleLabel: string): string {
  return angleLabel === "Your recording" ? "Play your recording" : `Play ${angleLabel}`;
}

/**
 * One recording: poster (or placeholder), angle label, status, Watch.
 * The poster area plays too (same `onWatch`); Watch keeps the harness testID
 * and stays the card's one styled button. While processing the poster is
 * inert and hidden from accessibility so "Processing" is announced once.
 */
export function MatchVideoCard({ video, primary, onWatch }: MatchVideoCardProps) {
  const tokens = useThemedTokens();
  const duration = formatVideoDuration(video.duration_seconds);
  const processing = video.playability === "processing";

  return (
    <View
      testID={`match-video-card-${video.id}`}
      className="bg-surface-3 border border-hairline rounded-md overflow-hidden"
    >
      <Pressable
        testID={`match-video-play-${video.id}`}
        accessible={!processing}
        accessibilityRole="button"
        accessibilityLabel={processing ? undefined : playLabel(video.angle_label)}
        accessibilityState={{ disabled: processing }}
        disabled={processing}
        onPress={onWatch}
        className="bg-surface-4 items-center justify-center active:opacity-70"
        style={{ aspectRatio: 16 / 9 }}
      >
        {video.poster_url ? (
          <Image
            testID="match-video-poster"
            // The signed URL changes on every refetch (focus, pull-to-refresh);
            // keying the cache by video id keeps the poster from flashing.
            source={{ uri: video.poster_url, cacheKey: `match-video-poster-${video.id}` }}
            recyclingKey={video.id}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View testID="match-video-placeholder" pointerEvents="none">
            <PlayCircle size={32} color={tokens.textTertiary} />
          </View>
        )}
      </Pressable>
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
        <WatchButton video={video} primary={primary} onWatch={onWatch} />
      </View>
    </View>
  );
}

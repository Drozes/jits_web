import * as React from "react";
import { Text, View } from "react-native";
import type { MatchDetailVideo } from "@jits/shared/api/queries";

/**
 * The status line under a video card's label. Playable renders nothing;
 * processing gets the amber chip; failed keeps Watch (the original MP4 is
 * usually still in storage) with a muted note.
 */
export function MatchVideoStatus({ video }: { video: MatchDetailVideo }) {
  if (video.playability === "processing") {
    return (
      <View className="gap-2">
        <View className="self-start px-2 py-1 border border-amber-500 rounded-xs">
          <Text className="font-mono-bold text-[10px] text-amber-500 uppercase tracking-caps-l">
            {video.status === "uploading" ? "UPLOADING" : "PROCESSING"}
          </Text>
        </View>
        <Text className="font-body text-[12px] text-ink-3">
          Still uploading. Pull down to refresh.
        </Text>
      </View>
    );
  }
  if (video.playability === "failed") {
    return (
      <Text className="font-body text-[12px] text-ink-3">
        Processing failed. The original recording may still play.
      </Text>
    );
  }
  return null;
}

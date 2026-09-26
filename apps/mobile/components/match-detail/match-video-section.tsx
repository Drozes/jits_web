import * as React from "react";
import { Text, View } from "react-native";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { MatchVideoCard } from "./match-video-card";
import { MatchNoVideo } from "./match-detail-states";

interface MatchVideoSectionProps {
  videos: MatchDetailVideo[];
  onWatch: (videoId: string) => void;
}

/**
 * MATCH VIDEO(S) heading and one card per recording (viewer's own first, as
 * the shared layer sorts them). Only the first card that can be watched gets
 * the Signal Red Watch: one primary CTA per surface.
 */
export function MatchVideoSection({ videos, onWatch }: MatchVideoSectionProps) {
  const primaryId = videos.find((v) => v.playability !== "processing")?.id;
  return (
    <View className="gap-3">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {videos.length > 1 ? "Match videos" : "Match video"}
      </Text>
      {videos.length === 0 ? (
        <MatchNoVideo />
      ) : (
        videos.map((v) => (
          <MatchVideoCard
            key={v.id}
            video={v}
            primary={v.id === primaryId}
            onWatch={() => onWatch(v.id)}
          />
        ))
      )}
    </View>
  );
}

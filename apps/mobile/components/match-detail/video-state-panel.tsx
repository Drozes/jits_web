import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

export type VideoPanelKind = "failed" | "absent" | "processing" | "missing";

const PANELS: Record<
  VideoPanelKind,
  { testID: string; title: string; body: string; action: "retry" | "back" }
> = {
  failed: {
    testID: "video-load-failed",
    title: "Couldn't play this video",
    body: "The link may have expired or your connection dropped.",
    action: "retry",
  },
  absent: {
    testID: "video-unavailable",
    title: "Video unavailable",
    body: "This recording was removed or you don't have access to it.",
    action: "back",
  },
  processing: {
    testID: "video-processing",
    title: "Still uploading",
    body: "This recording hasn't finished uploading. Check back in a minute.",
    action: "retry",
  },
  missing: {
    testID: "video-file-missing",
    title: "Video file not found",
    body: "The upload didn't finish, so this recording can't be played.",
    action: "back",
  },
};

interface VideoStatePanelProps {
  kind: VideoPanelKind;
  onRetry: () => void;
  onBack: () => void;
}

/** A player state that is not playback: title, one line, one text action. */
export function VideoStatePanel({ kind, onRetry, onBack }: VideoStatePanelProps) {
  const panel = PANELS[kind];
  const retry = panel.action === "retry";
  return (
    <View testID={panel.testID} className="flex-1 items-center justify-center px-8 gap-2">
      <Text
        className={cn(
          "font-mono text-[11px] uppercase tracking-caps-l text-center",
          // Red only for a real failure; "not yet" and "not yours" are neutral.
          kind === "failed" || kind === "missing" ? "text-negative" : "text-ink",
        )}
      >
        {panel.title}
      </Text>
      <Text className="font-body text-[12px] text-ink-3 text-center">{panel.body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={retry ? "Retry loading video" : "Back"}
        onPress={retry ? onRetry : onBack}
        hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
        className="active:opacity-70"
      >
        <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
          {retry ? "Try again" : "Back"}
        </Text>
      </Pressable>
    </View>
  );
}

import * as React from "react";
import { Text, View } from "react-native";
import { SHARE_COPY } from "@/lib/highlight-share";
import { progressPercent } from "./viewer-copy";

/**
 * "Preparing your reel… {pct}%" with a determinate bar (the only motion the
 * sheet adds: it moves with the download, never on its own).
 */
export function ShareProgress({ progress }: { progress: number | null }) {
  const pct = progressPercent(progress);
  return (
    <View testID="share-progress" className="gap-2">
      <Text
        accessibilityLiveRegion="polite"
        className="font-body text-[12px] text-ink-2"
      >
        {`${SHARE_COPY.downloadProgressPrefix} `}
        <Text testID="share-progress-pct" className="font-mono text-ink" style={{ fontVariant: ["tabular-nums"] }}>
          {pct}%
        </Text>
      </Text>
      <View className="h-1 bg-surface-4 rounded-xs overflow-hidden">
        <View testID="share-progress-bar" className="h-1 bg-ink-3" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

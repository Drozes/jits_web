import * as React from "react";
import { Text, View } from "react-native";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { metaLine, regeneratingBanner } from "@/lib/highlight/highlight-copy";
import { MonoNumbers } from "@/components/match-detail/highlight/mono-numbers";

/** The phase-1 regenerating banner, then "{duration}s · Version {n}" in mono. */
export function ViewerMeta({ progress }: { progress: HighlightProgress | null }) {
  const playback = progress?.playback ?? null;
  return (
    <>
      {progress?.phase === "regenerating" ? (
        <View testID="viewer-regenerating" className="bg-surface-4 rounded-md px-3 py-2">
          <Text className="font-body text-[12px] text-ink">
            <MonoNumbers text={regeneratingBanner(progress.renderTotal)} />
          </Text>
        </View>
      ) : null}
      {playback ? (
        <Text testID="viewer-meta" className="font-mono text-[12px] text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
          {metaLine(playback.durationS, playback.version)}
        </Text>
      ) : null}
    </>
  );
}

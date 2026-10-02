import * as React from "react";
import { Text, View } from "react-native";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import {
  HIGHLIGHT_COPY,
  metaLine,
  regeneratingBanner,
  whatChanged,
} from "@/lib/highlight/highlight-copy";
import { HighlightNote } from "./highlight-states";
import { MonoNumbers } from "./mono-numbers";

/** Under the player: regenerating banner, mono meta, what changed, failed-attempt note. */
export function HighlightReelNotes({ progress }: { progress: HighlightProgress }) {
  const playback = progress.playback;
  return (
    <>
      {progress.phase === "regenerating" ? (
        <View testID="highlight-regenerating" className="bg-surface-4 rounded-md px-3 py-2">
          <Text className="font-body text-small text-ink">
            <MonoNumbers text={regeneratingBanner(progress.renderTotal)} />
          </Text>
        </View>
      ) : null}
      {playback ? (
        <Text
          testID="highlight-meta"
          className="font-mono text-small text-ink-3"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {metaLine(playback.durationS, playback.version)}
        </Text>
      ) : null}
      {progress.lastChangeSummary ? (
        <HighlightNote testID="highlight-change-summary">{whatChanged(progress.lastChangeSummary)}</HighlightNote>
      ) : null}
      {progress.lastAttemptFailed ? (
        <HighlightNote testID="highlight-last-attempt-failed">{HIGHLIGHT_COPY.lastAttemptFailed}</HighlightNote>
      ) : null}
    </>
  );
}

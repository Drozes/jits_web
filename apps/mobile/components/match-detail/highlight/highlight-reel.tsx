import * as React from "react";
import { Text, View } from "react-native";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import type { UseMyHighlightResult } from "@/lib/highlight/use-my-highlight";
import { useHighlightRating } from "@/lib/highlight/use-highlight-rating";
import { HighlightPlayer } from "./highlight-player";
import { HIGHLIGHT_FRAME_STYLE } from "./highlight-frame";
import { HighlightNote } from "./highlight-states";
import { HighlightFeedbackRow } from "./highlight-feedback-row";
import { HighlightReelNotes } from "./highlight-reel-notes";
import { HighlightFeedbackSheet } from "./highlight-feedback-sheet";
import { HighlightFeedbackForm } from "./highlight-feedback-form";

type Props = Pick<UseMyHighlightResult, "source" | "playbackFailed" | "onPlayerError" | "refresh"> & {
  progress: HighlightProgress;
};

/**
 * `ready` and `regenerating`: the live version plays in both (a regenerate
 * never unmounts the player), meta in mono, change summary, failed-attempt
 * note, the regenerating banner, feedback row and the sheet.
 */
export function HighlightReel({ progress, source, playbackFailed, onPlayerError, refresh }: Props) {
  const playback = progress.playback;
  const regenerating = progress.phase === "regenerating";
  const fb = useHighlightRating(progress.highlightId, playback?.version ?? null, refresh);

  return (
    <View className="gap-3">
      {playbackFailed ? (
        <HighlightNote testID="highlight-cannot-play">{HIGHLIGHT_COPY.cannotPlay}</HighlightNote>
      ) : source ? (
        <HighlightPlayer source={source} onError={onPlayerError} />
      ) : (
        <View testID="highlight-player-loading" className="bg-surface-4 rounded-md" style={HIGHLIGHT_FRAME_STYLE} />
      )}
      <HighlightReelNotes progress={progress} />
      <HighlightFeedbackRow
        rating={fb.rating}
        improveDisabled={regenerating}
        onThumbsUp={fb.thumbsUp}
        onThumbsDown={fb.thumbsDown}
        onImprove={fb.openImprove}
      />
      {progress.highlightId ? (
        <HighlightFeedbackSheet open={fb.sheetOpen} busy={fb.busy !== null} onClosed={fb.onSheetClosed}>
          {fb.sheet ? (
            <HighlightFeedbackForm
              key={fb.sheet.id}
              preset={fb.sheet.preset}
              storedRating={fb.rating}
              busy={fb.busy}
              error={fb.sheetError}
              progress={progress}
              onSubmit={fb.submit}
            />
          ) : null}
        </HighlightFeedbackSheet>
      ) : null}
    </View>
  );
}

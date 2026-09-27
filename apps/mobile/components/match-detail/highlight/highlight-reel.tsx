import * as React from "react";
import { Text, View } from "react-native";
import { toast } from "@/components/ui/toast";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import type { UseMyHighlightResult } from "@/lib/highlight/use-my-highlight";
import { useHighlightRating } from "@/lib/highlight/use-highlight-rating";
import type { FeedbackSubmitKind } from "@/lib/highlight/use-highlight-feedback-form";
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
  const fb = useHighlightRating(progress.highlightId, playback?.version ?? null);
  const { closeSheet } = fb;
  const onDone = React.useCallback(
    (kind: FeedbackSubmitKind) => {
      closeSheet();
      if (kind === "regenerated") toast.success(HIGHLIGHT_COPY.regenerateToast);
      else toast.success(HIGHLIGHT_COPY.feedbackSentToast);
      refresh();
    },
    [closeSheet, refresh],
  );

  return (
    <View className="gap-3">
      {source ? (
        <HighlightPlayer source={source} onError={onPlayerError} />
      ) : playbackFailed ? (
        <HighlightNote testID="highlight-cannot-play">{HIGHLIGHT_COPY.cannotPlay}</HighlightNote>
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
        <HighlightFeedbackSheet open={fb.sheetOpen} onClosed={fb.onSheetClosed}>
          {fb.sheet ? (
            <HighlightFeedbackForm
              key={fb.sheet.id}
              highlightId={progress.highlightId}
              preset={fb.sheet.preset}
              progress={progress}
              onStored={fb.markSubmitted}
              onDone={onDone}
            />
          ) : null}
        </HighlightFeedbackSheet>
      ) : null}
    </View>
  );
}

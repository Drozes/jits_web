import * as React from "react";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import type { UseHighlightRatingResult } from "@/lib/highlight/use-highlight-rating";
import { HighlightFeedbackSheet } from "@/components/match-detail/highlight/highlight-feedback-sheet";
import { HighlightFeedbackForm } from "@/components/match-detail/highlight/highlight-feedback-form";

/** The phase-1 "Improve this reel" sheet, wired exactly as `highlight-reel.tsx` does. */
export function ViewerImproveSheet({ fb, progress }: { fb: UseHighlightRatingResult; progress: HighlightProgress }) {
  return (
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
  );
}

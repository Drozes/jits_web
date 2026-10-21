import * as React from "react";
import { View } from "react-native";
import type { TimekeeperReview } from "@jits/shared/api/timekeeper";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { Button } from "@/components/ui/elo-system/button";
import { ResultForm, type ResultAthlete, type ResultSubmission } from "@/components/match-flow/steps/result-form";
import { REVIEWS_REUSED_COPY as R } from "@/lib/admin/timekeeper-reviews-copy";
import { ReviewSummary } from "./timekeeper-review-row";

/** The winner tiles, challenger first; null unless the review names both athletes. */
export function reviewAthletes(review: Pick<TimekeeperReview, "athletes">): readonly [ResultAthlete, ResultAthlete] | null {
  if (review.athletes.length !== 2) return null;
  const [a, b] = review.athletes.map((x) => ({ athleteId: x.id, displayName: x.displayName, currentElo: null, weightLbs: null }));
  return [a, b];
}

export interface TimekeeperRecordFormProps {
  review: TimekeeperReview;
  submissionTypes: SubmissionType[];
  busy: boolean;
  onSubmit: (value: ResultSubmission) => void;
  onBack: () => void;
}

/**
 * Record result for a stalled match (A27, board P-TK-B15 frame 5): M5's
 * standalone `ResultForm` (never edited here, review round 6 N5) under the
 * row's matchup and TK-AD3, with the shipped heading and button, the full
 * submission list (A12) and the final clock as the bound and the prefill.
 * The tiles show names only: no ratings or weights (the review carries
 * none) and no YOU / OPPONENT. Back returns to the list without recording.
 */
export function TimekeeperRecordForm({ review, submissionTypes, busy, onSubmit, onBack }: TimekeeperRecordFormProps) {
  const athletes = reviewAthletes(review);
  if (!athletes) return null;
  return (
    <View testID="tk-review-record-form" style={{ gap: 20 }}>
      <ReviewSummary review={review} />
      <ResultForm
        athletes={athletes}
        durationSeconds={review.durationSeconds ?? review.finalElapsedS ?? 0}
        finalElapsedS={review.finalElapsedS}
        submissionTypes={submissionTypes}
        submissionLayout="list"
        busy={busy}
        onSubmit={onSubmit}
      />
      <Button testID="tk-review-record-back" variant="ghost" label={R.back} disabled={busy} onPress={onBack} />
    </View>
  );
}

import * as React from "react";
import { Text, View } from "react-native";
import type { TimekeeperReview } from "@jits/shared/api/timekeeper";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { shortName } from "@/lib/match-flow/short-name";
import { REVIEWS_REUSED_COPY as R, TIMEKEEPER_REVIEWS_COPY as C } from "@/lib/admin/timekeeper-reviews-copy";

/** `4:35 PM`: the device's short local time (TK-AD3's `{time}`, as TK-H8). */
export function formatClockEnded(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** A short name, or the shipped empty value when there is no name to show. */
const nameOr = (displayName: string | null | undefined) => (displayName ? shortName(displayName) : R.noValue);

/** `{A} vs {B}`, challenger first. */
export function reviewMatchup(review: Pick<TimekeeperReview, "athletes">): string {
  const [a, b] = review.athletes;
  return R.matchup({ a: nameOr(a?.displayName), b: nameOr(b?.displayName) });
}

/** TK-AD3: who timekept, when the clock ended and the final clock (`--` / `--:--` when unknown). */
export function reviewMeta(review: Pick<TimekeeperReview, "timekeeper" | "endedAt" | "finalElapsedS">): string {
  return C["TK-AD3"]({
    name: nameOr(review.timekeeper?.displayName),
    time: review.endedAt ? formatClockEnded(review.endedAt) : R.noValue,
    clock: review.finalElapsedS != null ? formatElapsed(review.finalElapsedS) : R.noClock,
  });
}

/** The matchup and TK-AD3, on the row and above the record form. */
export function ReviewSummary({ review }: { review: TimekeeperReview }) {
  return (
    <View className="gap-1">
      <Text numberOfLines={1} className="font-heading text-callout text-ink">
        {reviewMatchup(review)}
      </Text>
      <Text className="font-mono tabular-nums text-caption text-ink-2">{reviewMeta(review)}</Text>
    </View>
  );
}

export interface TimekeeperReviewRowProps {
  review: TimekeeperReview;
  /** This row's Record result or Void is in flight. */
  busy: boolean;
  /** Another row's is: one resolve at a time. */
  locked: boolean;
  onRecord: () => void;
  onVoid: () => void;
}

/**
 * One stalled result in Admin > Timekeeper reviews (A27, board P-TK-B15):
 * the matchup, TK-AD3 and the two TK-AD4 actions. Neither action is the red
 * primary: the record form's own button is, once it opens. Void is the
 * destructive outline (the screen confirms it first, TK-AD5). Record result
 * needs both athletes on the row.
 */
export function TimekeeperReviewRow({ review, busy, locked, onRecord, onVoid }: TimekeeperReviewRowProps) {
  const inert = busy || locked;
  return (
    <Plate testID={`tk-review-row-${review.matchId}`} className="gap-3">
      <ReviewSummary review={review} />
      <View className="flex-row gap-3">
        <Button
          testID={`tk-review-record-${review.matchId}`}
          variant="secondary"
          label={C["TK-AD4"].record}
          height={44}
          className="flex-1"
          disabled={inert || review.athletes.length !== 2}
          onPress={onRecord}
        />
        <Button
          testID={`tk-review-void-${review.matchId}`}
          variant="destructive"
          label={C["TK-AD4"].void}
          height={44}
          className="flex-1"
          busy={busy}
          disabled={locked}
          onPress={onVoid}
        />
      </View>
    </Plate>
  );
}

import * as React from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { Redirect } from "expo-router";
import type { TimekeeperReview } from "@jits/shared/api/timekeeper";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { TimekeeperReviewRow } from "@/components/admin/timekeeper-review-row";
import { TimekeeperRecordForm } from "@/components/admin/timekeeper-record-form";
import type { ResultSubmission } from "@/lib/match-flow/use-result-form";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAdminTimekeeperReviews } from "@/lib/admin/use-admin-timekeeper-reviews";
import { REVIEWS_REUSED_COPY as R, TIMEKEEPER_REVIEWS_COPY as C } from "@/lib/admin/timekeeper-reviews-copy";

/** TK-AD5, then `onConfirm` on Void only (Keep is the safe button). */
function confirmVoid(onConfirm: () => void) {
  const alert = C["TK-AD5"];
  Alert.alert(alert.title, alert.body, [
    { text: alert.cancel, style: "cancel" },
    { text: alert.confirm, style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * Admin > Timekeeper reviews (A27, spec 9.2, board P-TK-B15): the timekeeper-
 * mode matches whose result stalled, oldest first, each with Record result
 * (the record form in place of the list) and Void (confirmed first, TK-AD5).
 * TK-N12 opens it (`admin_href`). Built like the shipped no-match screen and
 * self-guarded like the hub: a non-admin, or one the server refuses, is
 * redirected, and the admin RPCs are never called for them.
 */
export default function AdminTimekeeperReviewsScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const tokens = useThemedTokens();
  const list = useAdminTimekeeperReviews(isAdmin);
  const [recordingId, setRecordingId] = React.useState<string | null>(null);

  if ((!authLoading && !isAdmin) || list.notAdmin) return <Redirect href="/" />;

  // A review that left the list (recorded, voided or resolved elsewhere) closes its form.
  const recording = recordingId ? (list.reviews.find((r) => r.matchId === recordingId) ?? null) : null;

  async function submitRecord(review: TimekeeperReview, value: ResultSubmission) {
    const outcome = await list.record(review.matchId, value);
    if (outcome !== "failed") setRecordingId(null);
  }

  return (
    <>
      <AppHeader title={C["TK-AD1"]} back />
      <PageContainer noTabBar keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 24, gap: 12 }}>
        {recording ? (
          <TimekeeperRecordForm
            review={recording}
            submissionTypes={list.submissionTypes}
            busy={list.busyMatchId === recording.matchId}
            onSubmit={(value) => void submitRecord(recording, value)}
            onBack={() => setRecordingId(null)}
          />
        ) : list.isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        ) : list.loadFailed ? (
          <Plate variant="loss">
            <Button testID="tk-reviews-retry" variant="secondary" label={R.retry} height={36} className="self-start" onPress={list.reload} />
          </Plate>
        ) : (
          <>
            {list.reviews.length === 0 ? (
              <Plate>
                <Text testID="tk-reviews-empty" className="font-body text-body text-ink-2">
                  {C["TK-AD2"]}
                </Text>
              </Plate>
            ) : (
              list.reviews.map((review) => (
                <TimekeeperReviewRow
                  key={review.matchId}
                  review={review}
                  busy={list.busyMatchId === review.matchId}
                  locked={list.busyMatchId !== null && list.busyMatchId !== review.matchId}
                  onRecord={() => setRecordingId(review.matchId)}
                  onVoid={() => confirmVoid(() => void list.voidMatch(review.matchId))}
                />
              ))
            )}
            <Button variant="secondary" label={R.refresh} height={36} className="self-start" onPress={list.reload} />
          </>
        )}
      </PageContainer>
    </>
  );
}

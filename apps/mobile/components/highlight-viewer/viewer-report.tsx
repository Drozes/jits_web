import * as React from "react";
import { View } from "react-native";
import { Flag } from "lucide-react-native";
import { MODERATION_COPY } from "@/lib/moderation/moderation-copy";
import { ContentReportSheet, type ReportTarget } from "@/components/moderation/content-report-sheet";
import { ReelRailButton } from "./reel-rail-button";
import type { ReelBinding } from "./reel-binding";

/** The rail of a reel that is not the athlete's: only Report (App Review 1.2, jits-rog5.11). */
export function ViewerReportRail({ onPress }: { onPress: () => void }) {
  return (
    <View testID="viewer-rail" pointerEvents="box-none" className="items-center gap-5">
      <ReelRailButton
        testID="viewer-report"
        variant="secondary"
        Icon={Flag}
        label={MODERATION_COPY.report}
        a11yLabel={MODERATION_COPY.reportReel}
        onPress={onPress}
      />
    </View>
  );
}

/**
 * Report for someone else's reel: `onReport` (undefined on your own reel,
 * which the server would refuse with `cannot_report_self`) and its sheet.
 * While the sheet is open the reel pauses and the pager cannot swipe, like
 * the share and improve sheets (`use-reel-page.ts`).
 */
export function useReelReport(
  isOwn: boolean,
  highlightId: string,
  binding: Pick<ReelBinding, "active" | "pool" | "onModalChange">,
): { onReport?: () => void; sheet: React.ReactNode } {
  const [target, setTarget] = React.useState<ReportTarget | null>(null);
  const open = target !== null;
  const { active, pool, onModalChange } = binding;
  React.useEffect(() => {
    if (!open) return;
    onModalChange?.(true);
    if (active) pool.setSuspended(true);
    return () => {
      onModalChange?.(false);
      if (active) pool.setSuspended(false);
    };
  }, [open, active, pool, onModalChange]);
  if (isOwn) return { sheet: null };
  return {
    onReport: () => setTarget({ type: "highlight", id: highlightId }),
    sheet: <ContentReportSheet target={target} onClose={() => setTarget(null)} />,
  };
}

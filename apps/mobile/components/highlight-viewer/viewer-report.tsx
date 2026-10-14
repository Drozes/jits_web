import * as React from "react";
import { View } from "react-native";
import { Flag } from "lucide-react-native";
import { MODERATION_COPY } from "@/lib/moderation/moderation-copy";
import { ContentReportSheet, type ReportTarget } from "@/components/moderation/content-report-sheet";
import { ReelRailButton } from "./reel-rail-button";

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
 */
export function useReelReport(isOwn: boolean, highlightId: string): { onReport?: () => void; sheet: React.ReactNode } {
  const [target, setTarget] = React.useState<ReportTarget | null>(null);
  if (isOwn) return { sheet: null };
  return {
    onReport: () => setTarget({ type: "highlight", id: highlightId }),
    sheet: <ContentReportSheet target={target} onClose={() => setTarget(null)} />,
  };
}

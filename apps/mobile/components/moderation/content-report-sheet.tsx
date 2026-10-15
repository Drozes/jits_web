import * as React from "react";
import type { ReportTargetType } from "@jits/shared/api/moderation";
import { FormSheet } from "@/components/ui/form-sheet";
import { ReportForm } from "./report-form";
import { useEverTrue } from "./athlete-moderation-sheet";

export interface ReportTarget {
  type: Exclude<ReportTargetType, "athlete">;
  id: string;
}

/**
 * Report a match video or a reel that belongs to another athlete (App Review
 * 1.2), from the match player and the reel viewer. `target` null is closed;
 * the form keeps its last target while the sheet animates out.
 */
export function ContentReportSheet(props: { target: ReportTarget | null; onClose: () => void }) {
  // Mounted on first open only (most viewings never report).
  const used = useEverTrue(props.target !== null);
  return used ? <ContentReportSheetBody {...props} /> : null;
}

function ContentReportSheetBody({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [shown, setShown] = React.useState<ReportTarget | null>(target);
  React.useEffect(() => {
    if (target) setShown(target);
  }, [target]);
  return (
    <FormSheet open={target !== null} busy={busy} onClosed={onClose}>
      {shown ? (
        <ReportForm
          key={`${shown.type}-${shown.id}`}
          targetType={shown.type}
          targetId={shown.id}
          onBusyChange={setBusy}
          onDone={onClose}
          onCancel={onClose}
        />
      ) : null}
    </FormSheet>
  );
}

import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  reportContent,
  type ReportReason,
  type ReportTargetType,
} from "@jits/shared/api/moderation";
import { Button } from "@/components/ui/elo-system/button";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { moderationClient } from "@/lib/moderation/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { typeSize } from "@/lib/typography";
import {
  MODERATION_COPY,
  REPORT_FAILED,
  REPORT_REASON_LABELS,
  moderationErrorCopy,
} from "@/lib/moderation/moderation-copy";

export interface ReportFormProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Busy while the report is sending (the host sheet holds still meanwhile). */
  onBusyChange?: (busy: boolean) => void;
  /** Sent: the host closes the sheet (the thanks toast is already up). */
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Report an athlete, a match video or a reel (App Review 1.2): one of five
 * reasons, optional details (1000 max), Submit. A refused report keeps the
 * sheet up with the reason inline; a sent one toasts the 24 hour promise.
 */
export function ReportForm({ targetType, targetId, onBusyChange, onDone, onCancel }: ReportFormProps) {
  const tokens = useThemedTokens();
  const [reason, setReason] = React.useState<ReportReason | null>(null);
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    const res = await reportContent(moderationClient(), { targetType, targetId, reason, details });
    setBusy(false);
    onBusyChange?.(false);
    if (!res.ok) {
      setError(moderationErrorCopy(res.error.hint, REPORT_FAILED));
      return;
    }
    toast.success(MODERATION_COPY.reportThanks);
    onDone();
  };

  return (
    <View testID="report-form" className="px-4 pb-8 pt-2 gap-4">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-heading text-title-l text-ink">
          {MODERATION_COPY.reportTitle[targetType]}
        </Text>
        <Text className="font-body text-body text-ink-2">{MODERATION_COPY.reportLede}</Text>
      </View>
      <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={MODERATION_COPY.reasonLabel}>
        {REPORT_REASONS.map((r) => {
          const selected = reason === r;
          return (
            <Pressable
              key={r}
              testID={`report-reason-${r}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: busy }}
              disabled={busy}
              onPress={() => setReason(r)}
              className={cn("min-h-11 flex-row items-center justify-between rounded-md border px-3 py-2", selectionSurface(selected))}
            >
              <Text className={cn("font-body text-body", selected ? "text-ink" : "text-ink-2")}>{REPORT_REASON_LABELS[r]}</Text>
              {selected ? <SelectCheck /> : null}
            </Pressable>
          );
        })}
      </View>
      <View className="gap-1">
        <BottomSheetTextInput
          testID="report-details"
          value={details}
          onChangeText={setDetails}
          maxLength={REPORT_DETAILS_MAX}
          multiline
          editable={!busy}
          placeholder={MODERATION_COPY.detailsPlaceholder}
          placeholderTextColor={tokens.textTertiary}
          accessibilityLabel={MODERATION_COPY.detailsLabel}
          className="min-h-[72px] rounded-md border border-hairline-strong bg-surface-3 px-3 py-2 font-body text-ink"
          style={[typeSize("body"), { textAlignVertical: "top" }]}
        />
        <Text testID="report-details-counter" className="self-end font-mono text-caption text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
          {`${details.length}/${REPORT_DETAILS_MAX}`}
        </Text>
      </View>
      {error ? (
        <Text testID="report-error" accessibilityRole="alert" className="font-body text-small text-ink">
          {error}
        </Text>
      ) : null}
      <View className="gap-2">
        <Button testID="report-submit" label={MODERATION_COPY.submit} disabled={!reason} busy={busy} onPress={() => void submit()} />
        <Button testID="report-cancel" variant="ghost" height={44} label={MODERATION_COPY.cancel} disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}

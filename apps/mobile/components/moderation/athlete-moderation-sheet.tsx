import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Flag, ShieldOff, ShieldBan } from "lucide-react-native";
import { FormSheet } from "@/components/ui/form-sheet";
import { Button } from "@/components/ui/elo-system/button";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { blockAndRefresh, unblockAndRefresh } from "@/lib/moderation/block-store";
import {
  BLOCK_FAILED,
  MODERATION_COPY,
  UNBLOCK_FAILED,
  moderationErrorCopy,
} from "@/lib/moderation/moderation-copy";
import { ReportForm } from "./report-form";

export type AthleteSheetMode = "menu" | "report" | "block";

export interface AthleteModerationSheetProps {
  /** Null: closed. */
  mode: AthleteSheetMode | null;
  onModeChange: (mode: AthleteSheetMode | null) => void;
  athlete: { id: string; name: string };
  /** I blocked this athlete: the menu offers Unblock instead of Block. */
  blockedByMe: boolean;
}

/**
 * The athlete profile's More sheet (App Review 1.2): Report athlete and
 * Block athlete (or Unblock), then the report form or the block confirm in
 * the same sheet. Never mounted on your own profile.
 */
export function AthleteModerationSheet(props: AthleteModerationSheetProps) {
  // Mounted on first open only: most profile visits never open it.
  const used = useEverTrue(props.mode !== null);
  return used ? <AthleteModerationSheetBody {...props} /> : null;
}

/** True from the first render where `value` is true, for good. */
export function useEverTrue(value: boolean): boolean {
  const [ever, setEver] = React.useState(value);
  if (value && !ever) setEver(true);
  return ever || value;
}

function AthleteModerationSheetBody({ mode, onModeChange, athlete, blockedByMe }: AthleteModerationSheetProps) {
  const [busy, setBusy] = React.useState(false);
  // The content stays on its last mode while the sheet animates closed.
  const [shown, setShown] = React.useState<AthleteSheetMode>("menu");
  React.useEffect(() => {
    if (mode) setShown(mode);
  }, [mode]);
  const close = () => onModeChange(null);

  const unblock = async () => {
    setBusy(true);
    const res = await unblockAndRefresh(athlete.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(moderationErrorCopy(res.error.hint, UNBLOCK_FAILED));
      return;
    }
    toast.success(MODERATION_COPY.unblocked(athlete.name));
    close();
  };

  const block = async () => {
    setBusy(true);
    const res = await blockAndRefresh(athlete.id, athlete.name);
    setBusy(false);
    if (!res.ok) {
      toast.error(moderationErrorCopy(res.error.hint, BLOCK_FAILED));
      return;
    }
    toast.success(MODERATION_COPY.blocked(athlete.name));
    close();
  };

  let body: React.ReactNode;
  if (shown === "report") {
    body = (
      <ReportForm
        key={`athlete-${athlete.id}`}
        targetType="athlete"
        targetId={athlete.id}
        onBusyChange={setBusy}
        onDone={close}
        onCancel={close}
      />
    );
  } else if (shown === "block") {
    body = (
      <View testID="block-confirm" className="px-4 pb-8 pt-2 gap-4">
        <Text accessibilityRole="header" className="font-heading text-title-l text-ink">
          {MODERATION_COPY.blockTitle(athlete.name)}
        </Text>
        <Text className="font-body text-body text-ink-2 leading-relaxed">{MODERATION_COPY.blockBody}</Text>
        <View className="gap-2">
          <Button testID="block-confirm-button" variant="destructive" label={MODERATION_COPY.blockConfirm} busy={busy} onPress={() => void block()} />
          <Button testID="block-cancel" variant="ghost" height={44} label={MODERATION_COPY.cancel} disabled={busy} onPress={close} />
        </View>
      </View>
    );
  } else {
    body = (
      <View testID="athlete-actions-menu" className="px-4 pb-8 pt-2 gap-2">
        <MenuRow testID="athlete-action-report" Icon={Flag} label={MODERATION_COPY.reportAthlete} onPress={() => onModeChange("report")} />
        {blockedByMe ? (
          <MenuRow testID="athlete-action-unblock" Icon={ShieldOff} label={MODERATION_COPY.unblockAthlete} disabled={busy} onPress={() => void unblock()} />
        ) : (
          <MenuRow testID="athlete-action-block" Icon={ShieldBan} label={MODERATION_COPY.blockAthlete} onPress={() => onModeChange("block")} />
        )}
      </View>
    );
  }

  return (
    <FormSheet open={mode !== null} busy={busy} onClosed={close}>
      {body}
    </FormSheet>
  );
}

function MenuRow({
  testID,
  Icon,
  label,
  disabled,
  onPress,
}: {
  testID: string;
  Icon: typeof Flag;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tokens = useThemedTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 rounded-md border border-hairline bg-surface-3 px-3 py-3 active:bg-surface-4"
    >
      <View pointerEvents="none">
        <Icon size={16} color={tokens.textSecondary} />
      </View>
      <Text className="font-heading text-small uppercase tracking-caps text-ink">{label}</Text>
    </Pressable>
  );
}

import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Ellipsis } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { unblockAndRefresh } from "@/lib/moderation/block-store";
import { MODERATION_COPY, UNBLOCK_FAILED, moderationErrorCopy } from "@/lib/moderation/moderation-copy";

/**
 * What a profile shows in place of stats when a block stands between us:
 * I blocked them (Unblock is offered), or they blocked me (nothing to do).
 * No challenge, compare or match history either way.
 */
export function BlockedAthleteState({ athlete, blockedByMe }: { athlete: { id: string; name: string }; blockedByMe: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const unblock = async () => {
    setBusy(true);
    const res = await unblockAndRefresh(athlete.id);
    setBusy(false);
    if (!res.ok) toast.error(moderationErrorCopy(res.error.hint, UNBLOCK_FAILED));
    else toast.success(MODERATION_COPY.unblocked(athlete.name));
  };
  return (
    <Plate testID="athlete-blocked-state" className="gap-3">
      <Text accessibilityRole="header" className="font-heading text-subhead uppercase tracking-caps text-ink">
        {blockedByMe ? MODERATION_COPY.blockedStateTitle : MODERATION_COPY.unavailableTitle}
      </Text>
      <Text className="font-body text-body text-ink-2 leading-relaxed">
        {blockedByMe ? MODERATION_COPY.blockedStateBody(athlete.name) : MODERATION_COPY.unavailableBody}
      </Text>
      {blockedByMe ? (
        <Button testID="athlete-unblock" variant="secondary" label={MODERATION_COPY.unblockAthlete} busy={busy} onPress={() => void unblock()} />
      ) : null}
    </Plate>
  );
}

/** The profile header's More button (opens the report / block sheet). */
export function MoreActionsButton({ onPress }: { onPress: () => void }) {
  const tokens = useThemedTokens();
  return (
    <Pressable
      testID="athlete-more"
      accessibilityRole="button"
      accessibilityLabel={MODERATION_COPY.more}
      onPress={onPress}
      hitSlop={10}
      className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
    >
      <View pointerEvents="none">
        <Ellipsis size={18} color={tokens.textSecondary} />
      </View>
    </Pressable>
  );
}

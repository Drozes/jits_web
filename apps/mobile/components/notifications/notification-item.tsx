import { Pressable, Text, View } from "react-native";
import { CheckCircle, Clapperboard, Swords, XCircle, Zap } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatRelativeDate } from "@jits/shared/utils";
import type { BellItem } from "@/lib/notifications/notification-items";

/**
 * Icon tones are ink steps only (WP2, R3 SC-6): a notification icon is a
 * marker, not a call to act, a gain or a live state, so it is never Signal
 * Red or Gain Green. The rows that need attention carry the unread dot.
 */
type IconKind = "strong" | "neutral";

const iconConfig: Record<
  BellItem["type"],
  { Icon: typeof Swords; tone: IconKind }
> = {
  match_result: { Icon: Swords, tone: "strong" },
  challenge_received: { Icon: Zap, tone: "strong" },
  challenge_accepted: { Icon: CheckCircle, tone: "strong" },
  challenge_declined: { Icon: XCircle, tone: "neutral" },
  session_joined: { Icon: Swords, tone: "neutral" },
  highlight_ready: { Icon: Clapperboard, tone: "neutral" },
};

function useIconColor(tone: IconKind) {
  const tokens = useThemedTokens();
  return tone === "strong" ? tokens.textSecondary : tokens.textTertiary;
}

export function NotificationRow({
  item,
  onPress,
}: {
  item: BellItem;
  onPress?: () => void;
}) {
  const { Icon, tone } = iconConfig[item.type];
  const iconColor = useIconColor(tone);
  // Unseen reels and fresh pending challenges (the rows the badge counts).
  const unread = item.unread === true;

  return (
    <Pressable
      testID={`notification-row-${item.id}`}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      // The dot is visual only; tell VoiceOver which rows the badge counts.
      accessibilityValue={unread ? { text: "new" } : undefined}
      className="flex-row items-start gap-3 rounded-xs px-3 py-3 active:bg-surface-3"
    >
      <View pointerEvents="none" className="w-8 h-8 items-center justify-center rounded-xs border border-hairline bg-surface-3">
        <Icon size={14} color={iconColor} />
      </View>
      <View className="flex-1 min-w-0 gap-1">
        <Text
          numberOfLines={1}
          className="font-heading text-body text-ink"
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={2}
          className="font-body text-small text-ink-2"
        >
          {item.body}
        </Text>
      </View>
      <View className="items-end gap-1.5 pt-0.5">
        <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
          {formatRelativeDate(item.createdAt)}
        </Text>
        {unread ? (
          <View testID={`notification-unread-${item.id}`} className="w-2 h-2 rounded-full bg-ink" />
        ) : null}
      </View>
    </Pressable>
  );
}

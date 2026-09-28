import { Pressable, Text, View } from "react-native";
import { CheckCircle, Clapperboard, Swords, XCircle, Zap } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatRelativeDate } from "@jits/shared/utils";
import { isHighlightItem, type BellItem } from "@/lib/notifications/notification-items";

type IconKind = "ranked" | "challenge" | "positive" | "neutral";

const iconConfig: Record<
  BellItem["type"],
  { Icon: typeof Swords; tone: IconKind }
> = {
  match_result: { Icon: Swords, tone: "ranked" },
  challenge_received: { Icon: Zap, tone: "challenge" },
  challenge_accepted: { Icon: CheckCircle, tone: "positive" },
  challenge_declined: { Icon: XCircle, tone: "neutral" },
  session_joined: { Icon: Swords, tone: "neutral" },
  highlight_ready: { Icon: Clapperboard, tone: "neutral" },
};

function useIconColor(tone: IconKind) {
  const tokens = useThemedTokens();
  switch (tone) {
    case "ranked":
      return tokens.accentCta;
    case "challenge":
      return tokens.accentCta;
    case "positive":
      return tokens.statePositive;
    case "neutral":
    default:
      return tokens.textTertiary;
  }
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
  const unread = isHighlightItem(item) && item.unread;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className="flex-row items-start gap-3 rounded-xs px-3 py-3 active:bg-surface-3"
    >
      <View pointerEvents="none" className="w-8 h-8 items-center justify-center rounded-xs border border-hairline bg-surface-3">
        <Icon size={14} color={iconColor} />
      </View>
      <View className="flex-1 min-w-0 gap-1">
        <Text
          numberOfLines={1}
          className="font-heading text-[13px] text-ink"
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={2}
          className="font-body text-[12px] text-ink-2"
        >
          {item.body}
        </Text>
      </View>
      <View className="items-end gap-1.5 pt-0.5">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {formatRelativeDate(item.createdAt)}
        </Text>
        {unread ? (
          <View testID={`notification-unread-${item.id}`} className="w-2 h-2 rounded-full bg-ink" />
        ) : null}
      </View>
    </Pressable>
  );
}

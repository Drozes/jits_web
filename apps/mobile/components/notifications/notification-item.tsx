import { Pressable, Text, View } from "react-native";
import { Swords, Zap, CheckCircle, XCircle } from "lucide-react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import type { NotificationItem } from "@jits/shared/types/notification";

const iconConfig: Record<
  NotificationItem["type"],
  { Icon: typeof Swords; color: string; bgClass: string }
> = {
  match_result: { Icon: Swords, color: "#E63946", bgClass: "bg-primary/10" },
  challenge_received: { Icon: Zap, color: "#f59e0b", bgClass: "bg-amber-500/10" },
  challenge_accepted: { Icon: CheckCircle, color: "#22c55e", bgClass: "bg-success/10" },
  challenge_declined: { Icon: XCircle, color: "#6b7280", bgClass: "bg-muted" },
  session_joined: { Icon: Swords, color: "#3b82f6", bgClass: "bg-blue-500/10" },
};

export function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress?: () => void;
}) {
  const { Icon, color, bgClass } = iconConfig[item.type];
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-start gap-3 rounded-lg px-3 py-3 active:bg-accent/40"
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full ${bgClass}`}>
        <Icon size={16} color={color} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-foreground">
          {item.title}
        </Text>
        <Text numberOfLines={2} className="text-xs text-muted-foreground">
          {item.body}
        </Text>
      </View>
      <Text className="pt-0.5 font-mono text-[11px] text-muted-foreground">
        {formatRelativeDate(item.createdAt)}
      </Text>
    </Pressable>
  );
}

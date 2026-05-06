import { Pressable, Text, View } from "react-native";
import { Swords } from "lucide-react-native";
import { formatRelativeDate } from "@jits/shared/utils";
import { cn } from "../../lib/cn";

export interface ActivityItem {
  id: string;
  winnerName: string;
  loserName: string;
  result: string;
  date: string;
}

export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const isDraw = item.result === "draw";
  return (
    <View className="flex-row items-start gap-3 p-4">
      <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
        <Swords size={16} className="text-primary" />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-foreground">
          <Text className="font-medium">{item.winnerName}</Text>
          {isDraw ? " drew with " : " defeated "}
          <Text className="font-medium">{item.loserName}</Text>
          {!isDraw && item.result ? (
            <Text>
              {" by "}
              <Text className="font-medium text-success">{item.result}</Text>
            </Text>
          ) : null}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {formatRelativeDate(item.date)}
        </Text>
      </View>
    </View>
  );
}

export function FilterPill<T extends string>({
  value,
  label,
  active,
  onSelect,
}: {
  value: T;
  label: string;
  active: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(value)}
      className={cn(
        "rounded-full px-3.5 py-1.5",
        active ? "bg-primary" : "bg-muted",
      )}
      accessibilityRole="button"
    >
      <Text
        className={cn(
          "text-xs font-medium",
          active ? "text-primary-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  message,
  showLink,
  onPressLink,
}: {
  message: string;
  showLink?: boolean;
  onPressLink?: () => void;
}) {
  return (
    <View className="rounded-2xl border border-dashed border-border p-8 items-center">
      <Text className="text-sm text-muted-foreground text-center">{message}</Text>
      {showLink ? (
        <Pressable onPress={onPressLink} className="mt-2">
          <Text className="text-xs font-medium text-primary">Find a session</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

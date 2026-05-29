import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { cn } from "@/lib/cn";

type ParticipantStatus = "available" | "busy" | "self";

interface ParticipantRowProps {
  name: string;
  subtitle: string;
  status?: ParticipantStatus;
  action?: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  available: "Available",
  busy: "In Match",
  self: "You",
};

const STATUS_BORDER: Record<ParticipantStatus, string> = {
  available: "border-positive",
  busy: "border-negative",
  self: "border-hairline-strong",
};

const STATUS_TEXT: Record<ParticipantStatus, string> = {
  available: "text-positive",
  busy: "text-negative",
  self: "text-ink-3",
};

function StatusBadge({ status }: { status: ParticipantStatus }) {
  return (
    <View className={cn("px-2 py-[2px] border rounded-xs", STATUS_BORDER[status])}>
      <Text
        className={cn(
          "font-mono-bold text-[10px] uppercase tracking-caps-l",
          STATUS_TEXT[status],
        )}
      >
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

export function ParticipantRow({
  name,
  subtitle,
  status,
  action,
  onPress,
  className,
}: ParticipantRowProps) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className={cn(
        "flex-row items-center gap-3 bg-surface-3 border border-hairline-faint rounded-xs px-4 py-3",
        className,
      )}
    >
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="font-heading text-[12px] text-ink"
        >
          {name}
        </Text>
        <Text className="font-mono text-[12px] text-ink-3 mt-[2px]">
          {subtitle}
        </Text>
      </View>
      {status ? <StatusBadge status={status} /> : null}
      {action ?? null}
    </Wrapper>
  );
}

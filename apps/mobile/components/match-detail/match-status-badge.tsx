import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { useAmber } from "./use-amber";

const MUTED: Record<string, string> = {
  voided: "VOIDED",
  cancelled: "CANCELLED",
};

/**
 * Disputed gets the amber chip plus one line of copy; voided / cancelled a
 * muted chip; every other status (completed, in progress) renders nothing.
 */
export function MatchStatusBadge({ status }: { status: string }) {
  const amber = useAmber();
  if (status === "disputed") {
    return (
      <View testID="match-disputed-badge" className="gap-2">
        <Chip label="DISPUTED" className={amber.border} textClassName={amber.text} />
        <Text className="font-body text-[12px] text-ink-3">
          This result is disputed and under review.
        </Text>
      </View>
    );
  }
  const label = MUTED[status];
  if (!label) return null;
  return <Chip label={label} className="border-hairline-strong" textClassName="text-ink-3" />;
}

function Chip({
  label,
  className,
  textClassName,
}: {
  label: string;
  className: string;
  textClassName: string;
}) {
  return (
    <View className={cn("self-start px-2 py-1 border rounded-xs", className)}>
      <Text
        className={cn(
          "font-mono-bold text-[10px] uppercase tracking-caps-l",
          textClassName,
        )}
      >
        {label}
      </Text>
    </View>
  );
}

import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Single "ready" indicator panel used in the ready-check step. Spinner
 * while waiting, green check once the athlete has tapped Ready.
 */
export function ReadyPanel({ label, ready }: { label: string; ready: boolean }) {
  const tokens = useThemedTokens();
  return (
    <View className="flex-1 items-center gap-2 rounded-xl border border-border p-5">
      {ready ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-success/10">
          <Check size={22} color={tokens.success} />
        </View>
      ) : (
        <ActivityIndicator color={tokens.mutedForeground} />
      )}
      <Text className="text-sm font-medium text-foreground">{label}</Text>
    </View>
  );
}

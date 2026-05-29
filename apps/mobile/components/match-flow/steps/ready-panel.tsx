import { ActivityIndicator, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

/**
 * Single "ready" indicator panel used in the ready-check step.
 *
 * ELO design system: hairline plate with a green-bordered ready state.
 * Spinner while waiting, positive check once the athlete has tapped Ready.
 * Mirrors D5 wireframe (lines 1180-1183).
 */
export function ReadyPanel({ label, ready }: { label: string; ready: boolean }) {
  const tokens = useThemedTokens();
  return (
    <View
      className={cn(
        "flex-1 items-center gap-2 rounded-md bg-surface-3 border px-3 py-5",
        ready ? "border-positive" : "border-hairline-strong",
      )}
    >
      {ready ? (
        <View className="h-10 w-10 items-center justify-center rounded-full border border-positive">
          <Check size={22} color={tokens.statePositive} />
        </View>
      ) : (
        <ActivityIndicator color={tokens.textSecondary} />
      )}
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          ready ? "text-positive" : "text-ink-2",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        {ready ? "Ready" : "Waiting"}
      </Text>
    </View>
  );
}

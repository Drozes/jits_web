import { ActivityIndicator, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface ReadyPanelProps {
  /** Visible name on the panel ("You", or the opponent's display name). */
  label: string;
  ready: boolean;
  /** Defaults to `ready-panel-<label>`; pass one when the label is a name. */
  testID?: string;
  /** Role spoken before the state; defaults to the label. */
  accessibilityName?: string;
}

/**
 * Single "ready" indicator panel used in the ready-check step.
 *
 * ELO design system: a plate that steps up to `plate-bright` with an `ink`
 * check once the athlete has tapped Ready; a spinner while waiting. Ready is
 * not a gain, so it is never Gain Green (WP2, R3 CO-2).
 * Mirrors D5 wireframe (lines 1180-1183).
 */
export function ReadyPanel({ label, ready, testID, accessibilityName }: ReadyPanelProps) {
  const tokens = useThemedTokens();
  return (
    <View
      testID={testID ?? `ready-panel-${label.toLowerCase()}`}
      accessible
      accessibilityLabel={`${accessibilityName ?? label}, ${ready ? "ready" : "waiting"}`}
      className={cn(
        "flex-1 items-center gap-2 rounded-md border border-hairline-strong px-3 py-5",
        ready ? "bg-surface-4" : "bg-surface-3",
      )}
    >
      {ready ? (
        <View className="h-10 w-10 items-center justify-center rounded-full border border-ink">
          <Check size={22} color={tokens.textPrimary} />
        </View>
      ) : (
        <ActivityIndicator color={tokens.textSecondary} />
      )}
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          ready ? "text-ink" : "text-ink-2",
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

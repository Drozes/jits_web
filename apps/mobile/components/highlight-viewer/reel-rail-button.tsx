import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import type { LucideIcon } from "lucide-react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { darkTokens } from "@/lib/tokens";

export interface ReelRailButtonProps {
  testID: string;
  /** The short visible label under the plate (C-V6 to C-V8). */
  label: string;
  /** The full shipped string, for screen readers. */
  a11yLabel: string;
  Icon: LucideIcon;
  /** `primary`: the page's ONE Signal Red CTA (Share). */
  variant: "primary" | "secondary";
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}

/**
 * One right-rail action: a 44 pt icon target with a small label under it.
 * Share is the Signal Red fill (Void icon); the others sit on the on-media
 * scrim. Press scale (Motion registry "Press scale"). Busy swaps the icon for a neutral spinner and makes it inert.
 */
export function ReelRailButton({ testID, label, a11yLabel, Icon, variant, disabled = false, busy = false, onPress }: ReelRailButtonProps) {
  const primary = variant === "primary";
  return (
    <View className="items-center gap-1" style={{ width: 64, opacity: disabled ? 0.5 : 1 }}>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled, busy }}
        disabled={disabled || busy}
        onPress={onPress}
        className={primary ? "bg-cta items-center justify-center rounded-sm" : "items-center justify-center rounded-sm"}
        style={{ width: 44, height: 44, ...(primary ? {} : { backgroundColor: ON_MEDIA.scrim }) }}
      >
        {busy ? (
          <ActivityIndicator testID={`${testID}-spinner`} size="small" color={darkTokens.textTertiary} />
        ) : (
          <Icon size={20} color={primary ? darkTokens.textOnAccent : ON_MEDIA.text} />
        )}
      </PressableScale>
      <Text className="font-heading text-caption text-center" style={{ color: ON_MEDIA.text }} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
    </View>
  );
}

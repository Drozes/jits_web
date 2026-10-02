import { Text, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { RefreshCw, X } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface UpdateBannerHeaderProps {
  /** Full sentence screen readers get for the "UPDATE READY" label. */
  accessibilityCopy: string;
  onDismiss: () => void;
}

/**
 * Line 1 of the update banner: icon, "UPDATE READY" label and the
 * dismiss X. The X is a full 44pt target (px, not h-11: NativeWind rem is 14); negative margins keep it
 * from growing the row, so the icon stays visually aligned to the padding.
 */
export function UpdateBannerHeader({
  accessibilityCopy,
  onDismiss,
}: UpdateBannerHeaderProps) {
  const tokens = useThemedTokens();
  return (
    <View className="flex-row items-center gap-2">
      <RefreshCw size={16} color={tokens.textPrimary} />
      <Text
        accessibilityLabel={accessibilityCopy}
        className="font-heading text-[12px] uppercase tracking-caps-l text-ink flex-1"
      >
        Update ready
      </Text>
      <PressableScale
        testID="update-banner-dismiss"
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update notice"
        className="h-[44px] w-[44px] items-center justify-center -my-[13px] -mr-[13px]"
      >
        <X size={18} color={tokens.textPrimary} />
      </PressableScale>
    </View>
  );
}

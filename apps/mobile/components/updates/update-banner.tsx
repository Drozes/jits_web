import { useEffect } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RefreshCw, X } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";

export const UPDATE_BANNER_COPY = "App updated. Restart for the latest experience.";

/**
 * Gap above the bottom safe-area inset. EloTabBar's content row is
 * py-3 (24) + 18px icon + gap-1 (4) + ~13px label line + 2px active border
 * + 1px hairline = ~62px above `insets.bottom`, so 72 leaves ~10px clear.
 */
export const UPDATE_BANNER_BOTTOM_OFFSET = 72;

interface UpdateBannerProps {
  onRestart: () => void;
  onDismiss: () => void;
  restarting: boolean;
}

/** Soft, dismissible notice for a downloaded non-critical OTA (jits-5i2w). */
export function UpdateBanner({ onRestart, onDismiss, restarting }: UpdateBannerProps) {
  const insets = useSafeAreaInsets();
  const tokens = useThemedTokens();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(UPDATE_BANNER_COPY);
  }, []);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: insets.bottom + UPDATE_BANNER_BOTTOM_OFFSET,
        zIndex: 900,
      }}
    >
      <View className="bg-surface-2 border border-hairline rounded-md px-3 py-2.5 flex-row items-center gap-3">
        <RefreshCw size={16} color={tokens.mutedForeground} />
        <Text className="font-body text-sm text-foreground flex-1" numberOfLines={2}>
          {UPDATE_BANNER_COPY}
        </Text>
        <Button
          testID="update-banner-restart"
          variant="outline"
          size="sm"
          textClassName="font-heading text-[12px] uppercase tracking-caps-l"
          disabled={restarting}
          onPress={onRestart}
        >
          {restarting ? "Restarting..." : "Restart"}
        </Button>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
        >
          <X size={16} color={tokens.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

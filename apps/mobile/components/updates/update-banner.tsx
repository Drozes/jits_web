import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { UpdateBannerHeader } from "./update-banner-header";

/** Full a11y copy: announced once and read for the "UPDATE READY" label. */
export const UPDATE_BANNER_COPY =
  "App updated. Restart for the latest experience.";
export const UPDATE_BANNER_BODY = "Restart for the latest experience.";

/** Gap above the bottom inset: clears EloTabBar's ~62px row by ~10px. */
export const UPDATE_BANNER_BOTTOM_OFFSET = 72;

interface UpdateBannerProps {
  onRestart: () => void;
  onDismiss: () => void;
  restarting: boolean;
}

/**
 * Dismissible notice for a downloaded non-critical OTA. Inverted surface
 * (jits-5i2w.6) so it is not lost; RESTART is inverted too, never Signal Red.
 */
export function UpdateBanner({
  onRestart,
  onDismiss,
  restarting,
}: UpdateBannerProps) {
  const insets = useSafeAreaInsets();

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
      <View
        testID="update-banner-surface"
        className="bg-foreground rounded-md px-4 py-3 gap-2"
      >
        <UpdateBannerHeader
          accessibilityCopy={UPDATE_BANNER_COPY}
          onDismiss={onDismiss}
        />
        <View className="flex-row items-center gap-3">
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="font-body text-base text-background flex-1"
            numberOfLines={2}
          >
            {UPDATE_BANNER_BODY}
          </Text>
          {/* opacity-100 beats Button's disabled opacity-50 (twMerge): readable. */}
          <Button
            testID="update-banner-restart"
            variant="ghost"
            className="bg-background opacity-100"
            textClassName="font-heading text-[12px] uppercase tracking-caps-l text-foreground"
            disabled={restarting}
            onPress={onRestart}
          >
            {restarting ? "Restarting..." : "Restart"}
          </Button>
        </View>
      </View>
    </View>
  );
}

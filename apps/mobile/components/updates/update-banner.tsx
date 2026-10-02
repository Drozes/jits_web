import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/elo-system/button";
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

/** Height of the RESTART button: compact, inside the banner row. */
export const UPDATE_BANNER_BUTTON_HEIGHT = 36;

/**
 * Dismissible notice for a downloaded non-critical OTA (jits-5i2w.6). On the
 * ELO surfaces since WP4 (R3 SC-2): a `panel` card (`bg-surface-2`) with a
 * `hairline-strong` border so it separates from the screen under it without
 * a shadow, `ink` text, and RESTART as the unified `Button` `secondary`
 * variant (a `plate` fill, one tier up, so it reads as its own object) (never Signal Red: the screen under it owns its one red CTA).
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
        className="bg-surface-2 border border-hairline-strong rounded-md px-4 py-3 gap-2"
      >
        <UpdateBannerHeader
          accessibilityCopy={UPDATE_BANNER_COPY}
          onDismiss={onDismiss}
        />
        <View className="flex-row items-center gap-3">
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="font-body text-callout text-ink-2 flex-1"
            numberOfLines={2}
          >
            {UPDATE_BANNER_BODY}
          </Text>
          <Button
            testID="update-banner-restart"
            variant="secondary"
            height={UPDATE_BANNER_BUTTON_HEIGHT}
            label={restarting ? "Restarting..." : "Restart"}
            busy={restarting}
            onPress={onRestart}
          />
        </View>
      </View>
    </View>
  );
}

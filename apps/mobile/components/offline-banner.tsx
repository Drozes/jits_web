import * as React from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { WifiOff } from "lucide-react-native";
import { useNetworkStatus } from "@/lib/network/use-network-status";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { duration, easing, useReduceMotion } from "@/lib/motion";

/** How far above the screen the banner rests while hidden. */
export const OFFLINE_BANNER_HIDDEN_Y = -100;

/**
 * Top-of-screen banner shown when the device is offline (Motion Rule
 * registry row "Offline banner"). Sits inside the root layout above the
 * navigation stack so it overlays all routes. A React Native Modal is
 * presented above the root, so a modal that must explain an offline failure
 * (the incoming challenge prompt) mounts its own copy.
 *
 * Look (R3 SC-1, WP4): a neutral `panel` bar (`bg-surface-2`) with a
 * `hairline-strong` bottom edge and a mono caps `ink` line. Offline is a
 * state, not a loss, so it is never Signal Red.
 *
 * Motion: slides down on the UI thread (Reanimated `translateY`) over
 * `duration.fast` with the brand ease-out when the device goes offline;
 * under Reduce Motion it appears in place with no slide. When the device is
 * back online the content unmounts at once (nothing left to intercept
 * touches or to be read by a screen reader) and the empty bar returns above
 * the screen.
 *
 * Copy: "You're offline. Some features may not work."
 */
export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  // Read the context directly rather than useSafeAreaInsets(), which throws
  // without a provider: the banner is also mounted inside the incoming
  // challenge Modal, which suites render without one.
  const insets = React.useContext(SafeAreaInsetsContext) ?? { top: 0 };
  const tokens = useThemedTokens();
  const reduceMotion = useReduceMotion();
  const translateY = useSharedValue(OFFLINE_BANNER_HIDDEN_Y);

  React.useEffect(() => {
    const to = isConnected ? OFFLINE_BANNER_HIDDEN_Y : 0;
    translateY.value = reduceMotion ? to : withTiming(to, { duration: duration.fast, easing: easing.brandOut });
  }, [isConnected, reduceMotion, translateY]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <Animated.View
      testID="offline-banner"
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          paddingTop: isConnected ? 0 : insets.top,
        },
        slide,
      ]}
    >
      {isConnected ? null : (
        <View
          testID="offline-banner-surface"
          className="bg-surface-2 border-b border-hairline-strong flex-row items-center justify-center gap-2 px-4 py-2"
        >
          <WifiOff size={14} color={tokens.textPrimary} />
          <Text className="font-mono text-[11px] uppercase tracking-caps-l text-ink">
            You&apos;re offline. Some features may not work.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

import * as React from "react";
import { Animated, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { WifiOff } from "lucide-react-native";
import { useNetworkStatus } from "@/lib/network/use-network-status";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Top-of-screen banner shown when the device is offline. Slides in/out via
 * `Animated.timing` on the `translateY` axis. Sits inside the root layout
 * above the navigation stack so it overlays all routes. A React Native Modal
 * is presented above the root, so a modal that must explain an offline
 * failure (the incoming challenge prompt) mounts its own copy.
 *
 * Color: `bg-destructive` / `text-destructive-foreground`.
 * Copy: "You're offline. Some features may not work."
 */
export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  // Read the context directly rather than useSafeAreaInsets(), which throws
  // without a provider: the banner is also mounted inside the incoming
  // challenge Modal, which suites render without one.
  const insets = React.useContext(SafeAreaInsetsContext) ?? { top: 0 };
  const tokens = useThemedTokens();
  const translateY = React.useRef(new Animated.Value(-100)).current;

  React.useEffect(() => {
    Animated.timing(translateY, {
      toValue: isConnected ? -100 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isConnected, translateY]);

  // Render nothing once hidden so we don't intercept touches.
  if (isConnected) {
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          transform: [{ translateY }],
          zIndex: 1000,
        }}
      />
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        transform: [{ translateY }],
        zIndex: 1000,
        paddingTop: insets.top,
      }}
    >
      <View className="bg-destructive flex-row items-center justify-center gap-2 px-4 py-2">
        <WifiOff size={14} color={tokens.destructiveForeground} />
        <Text className="text-xs font-medium text-destructive-foreground">
          You&apos;re offline. Some features may not work.
        </Text>
      </View>
    </Animated.View>
  );
}

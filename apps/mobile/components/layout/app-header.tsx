import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface AppHeaderProps {
  title?: string;
  back?: boolean;
  /**
   * Where the back chevron goes when there is no history to pop (i.e. the screen
   * was the entry route via deep link or reload). Stack `initialRouteName`
   * anchors handle the common case; this is the explicit safety net so the
   * chevron can never become a dead, no-op button.
   */
  backFallback?: Href;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

/**
 * Mobile equivalent of apps/web/components/layout/app-header.tsx.
 * 56pt tall, [back | title | right] grid, font-heading caps title.
 */
export function AppHeader({
  title,
  back = false,
  backFallback,
  icon,
  rightAction,
  className,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useThemedTokens();

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (backFallback) {
      router.replace(backFallback);
    }
  }, [router, backFallback]);

  return (
    <View
      className={cn(
        "bg-surface-2 border-b border-hairline flex-row items-center px-4",
        className,
      )}
      style={{ paddingTop: insets.top, height: 56 + insets.top }}
    >
      <View style={{ width: 32, height: 32 }}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={handleBack}
            hitSlop={10}
            className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
          >
            <View pointerEvents="none">
              <ChevronLeft size={20} color={tokens.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1 flex-row items-center justify-center gap-2">
        {icon ? <View>{icon}</View> : null}
        {title ? (
          <Text
            numberOfLines={1}
            className="font-heading text-[12px] text-ink-2 uppercase tracking-caps-l"
          >
            {title}
          </Text>
        ) : null}
      </View>

      <View
        className="flex-row items-center justify-end"
        style={{ minWidth: 32, height: 32 }}
      >
        {rightAction}
      </View>
    </View>
  );
}
